# PG Manager

Fast, secure management for a small ladies' PG (2 bedrooms × 4 beds). Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Turso (libSQL) · Drizzle ORM · Zod. Deployable on Vercel.

- **Admin**: dashboard, tenants, rooms/beds, monthly invoices, partial/full payments + printable receipts, electricity & water bills with exact-rounding allocation, expenses, reports + CSV export, announcements, settings.
- **Tenant portal** (mobile-first): amount due, invoice breakdown, payment history, receipts, notices, profile, house rules, change password.
- All money is **integer paise**. Payments are **manual** — nothing is shown as "paid online" (no gateway is integrated).

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
npm run db:migrate                # applies ./drizzle migrations (run again after every pull that adds one)
ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='choose-a-long-password1' npm run admin:create
npm run dev                       # http://localhost:3000
```

`admin:create` also creates the two rooms, eight beds and the settings row (idempotent). There is **no public admin registration route**; the password is only read from that one command's environment — never put `ADMIN_*` in Vercel.

Quick local trial without Turso: set `TURSO_DATABASE_URL=file:local.db` (blank token) for the commands above, then `SEED_CONFIRM=yes npm run db:seed` loads **fictional** demo data (`admin@demo.test` / `DemoAdmin2026`; tenants `tenant1@demo.test`… / `DemoTenant2026`). The seed refuses to run without `SEED_CONFIRM=yes`; never run it against production.

## Create the Turso database

```bash
brew install tursodatabase/tap/turso && turso auth login
turso db create pg-manager --location bom        # Mumbai
turso db show pg-manager --url                   # -> TURSO_DATABASE_URL
turso db tokens create pg-manager                # -> TURSO_AUTH_TOKEN (keep secret)
```

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework: Next.js; build command `npm run build`).
2. Add environment variables (Production, and Preview if wanted): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_URL`.
3. **Migrate before first deploy** from your machine (or CI): `TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:migrate`.
4. Create the admin once (see above) pointing at the production DB.
5. Deploy. Check `https://<your-domain>/api/health` → `{"status":"ok"}`.

### Safe production migration procedure
1. Change `src/db/schema.ts` → `npm run db:generate` → review the generated SQL in `drizzle/`.
2. Take a backup point: `turso db shell pg-manager .dump > backup.sql` (or create a Turso branch/PITR point).
3. Apply to production with `npm run db:migrate` **before** deploying code that needs it. Prefer additive, backwards-compatible changes (add column/table, then deploy, then clean up later).
4. Migrations run only when you run them — never automatically at request time.

Verified in this configuration: foreign keys are enforced (`PRAGMA foreign_keys = 1`), interactive transactions roll back on error, and partial unique indexes work (see `tests/db.test.ts`).

## Security model
- Opaque 256-bit session token in an **HttpOnly, SameSite=Lax, Secure (`__Host-` prefixed in production)** cookie; only its SHA-256 is stored in `sessions`. 7-day expiry; logout deletes the row; password change/reset revokes other sessions; disabling a tenant revokes all.
- Passwords: **Argon2id** (`@node-rs/argon2`). Login lockout: 5 failures per (email, IP) → 15-minute lock, stored in DB (works on serverless). Unknown users and wrong passwords get the same message and similar timing.
- **Authorisation is server-side on every action/page.** Role comes from the DB via the session — never from client input. Tenant data functions take no tenant id; they derive it from the session (`src/services/portal.ts`). Another tenant's invoice/receipt id returns the 404 page. The CSV export checks admin itself.
- CSRF: Server Actions enforce same-origin (Origin vs Host) + SameSite=Lax cookie. All inputs are validated with Zod; unexpected errors are logged server-side and shown as a generic message.
- Audit log rows for logins, tenant changes, invoices, payments (incl. voids), utility bills, expenses, settings.
- CSV export neutralises spreadsheet formula injection. Security headers set in `next.config.ts`.
- Database credentials are only read server-side (`getDb()`); nothing secret reaches client bundles.
- Tenant photo & ID proofs: JPG/PNG/WebP/PDF up to 1.5 MB (big phone photos are shrunk in the browser; max 4 ID files + 1 photo per tenant). Files are stored **in the database** (table `tenant_documents`) — nothing is written to the Vercel filesystem and there is no public URL. They are served only by `/api/documents/[id]`, which requires login: admins can open any file, a tenant only their own (others get 404). File type is detected from the content (magic bytes), not the extension. Utility "bill reference" fields still hold a number or link only. If you later outgrow this, move the blobs to object storage (Vercel Blob / R2) and keep the same route.

## Billing rules
- **Eligible for a month**: joined on/before month end and not vacated before month start.
- **Invoice generation is idempotent**: unique `(tenant, month)`; one rent item per invoice; one item per utility bill. Running "Generate invoices" repeatedly changes nothing. Old balances stay on their own invoices (carried forward by being listed as outstanding), never re-charged.
- **Status**: paid (balance ≤ 0) · overdue (balance > 0 and today is after the due date, even if partly paid) · partial · unpaid. A bill is due *on* its due date.
- **Utilities**: one bill per (type, month). Allocation (equal residents / equal occupied beds [electricity] / custom) is computed once, rounded so shares sum exactly to the bill total (remainder paise go to the first tenants), and saved as a snapshot — later changes to residents never alter old bills. A utility bill auto-creates a matching expense (counted once). Meter readings are validated (closing ≥ opening). Utility bills can be deleted only if no payment exists on the affected invoices.
- **Shared expenses**: an expense can be split equally among the tenants active in its month, or given a custom amount per tenant (custom amounts may total less than the expense; you bear the rest). Each share is saved as a snapshot and added to that tenant's invoice as an "other" charge, so it shows on their dashboard and bill. Re-running invoice generation never duplicates it. Editing/un-sharing/deleting a shared expense is blocked once a payment exists on an affected invoice (void the payment first). Tenant payments toward these charges are reported as "Other income"; the expense itself still counts as an expense.
- **Payments** can't exceed the balance. They're never deleted: voiding keeps the row (with reason) and removes it from totals.
- **Reports**: *cash collected* = non-voided payments by payment date, attributed to rent/electricity/water/other by a rent→electricity→water→other waterfall per invoice. *Invoiced* is shown separately and is never treated as income.
- Rent is billed as a full month (no pro-rating for mid-month joins) — adjust with a discount line if needed.
- `invoices.total_paise/paid_paise` are denormalised for fast dashboards and recomputed inside the same transaction as every write.

## Lists, phones and tenant screens
- Every list shows **10 rows per page** with numbered pages ("Showing 11–20 of 34"); the pager appears only when there are more than 10. A page number past the end jumps to the last page.
- On phones, tables turn into **one card per row** (labelled lines, actions always visible) instead of scrolling sideways. Small numeric tables that already fit stay as tables. `npm run`-free check used during development: load every page at 360px/390px and flag anything wider than the screen.
- **Rooms**: add, edit, delete. A room nobody ever used is deleted outright; a room that had tenants before is *removed from the lists but its bed history is kept*; a room people still live in can't be removed.
- **Tenant dashboard** is deliberately minimal: greeting, today's date and time, this month's rent (Paid / Waiting for confirmation / Overdue / Unpaid + a Pay button) and announcements. **Rent** lists every month since they joined: Month · Rent · Status · Pay. After paying/reporting they return to Rent.

## Profiles
Admins edit their own **photo, name, email and mobile number** from the header menu → Profile settings (photos are private: only the owner and admins can open them). Tenants change their own photo on their Profile page. Confirmation pop-ups and toasts share one look across the app; pop-ups render outside tables so they never inherit cramped table styling.

## Admin shortcuts
- **Login as tenant** (Tenants list → arrow icon): opens the tenant's dashboard without their password. It is a separate, **read-only, 1-hour** session tied to the admin, shown with a banner and a **Back to admin** button; every change is blocked server-side, tenant notifications aren't marked read, and start/stop are written to the activity log. It cannot be nested and gives no admin access.
- **Collect all dues since check-in** (Payments → record payment → toggle): one entry settles every month from the tenant's check-in month up to the last due date, oldest first. Months with no bill yet are billed first (idempotent); each month gets its own receipt; leave the amount empty to collect everything, or enter a part-payment.
- **Settings** groups General, Landing page, Admins and Activity logs as tabs. Your own profile and Logout are in the header menu.

## Public landing page
`/` is a public home page (PG name, tagline, photos, facilities, contact, **Login** button). The owner manages it under **Admin → Website**: name/tagline/about/address, call + WhatsApp numbers, email, Google Maps link and up to 12 photos (JPG/PNG/WebP, shrunk in the browser). Facilities (rooms, beds, attached bathrooms) are read from your Rooms setup. This is the only part of the app visible without logging in, and everything on it is chosen by the owner. Photos are served by `/api/site-photos/[id]` (public, long-cached); the page itself refreshes every 5 minutes and immediately after the owner saves.

## Sharing logins & tenant-reported payments
- **Share on WhatsApp** (Tenants list → green chat icon): passwords are stored hashed, so an existing one can't be shown. Sharing creates a *new* random temporary password (old one stops working, sessions end, tenant must change it at first login) and opens WhatsApp with the login link, username and password prefilled. Set `APP_URL` in Vercel so the link uses your real domain.
- **"I've paid" (tenant dashboard)**: a tenant reports amount, date, method, reference and an optional screenshot. It is only a *report* — no balance, receipt or report changes until an admin approves it under Payments → "Reported by tenants" (approval creates a real payment + receipt; rejection needs a reason and notifies the tenant). Tenants can't report more than the unpaid balance (including other pending reports). Screenshots are private (owner + admins only).
- Tenants can change their own profile photo; ID documents stay admin-managed (read-only for them).

## Notifications (in-app)
A bell with an unread count sits in the sidebar / mobile header for both roles, with a Notifications page ("Mark all as read"; clicking one opens what it refers to). Users only ever see their own.
- **Tenant** gets: new notice, bill ready, new charge added to their bill (utility / shared expense), payment received (with receipt link), payment reversed, bill due in ≤2 days, bill overdue, notice-period / vacated status changes.
- **Admin** gets: tenant overdue, payment recorded or voided by *another* admin, tenant put on notice / vacated by another admin, new admin added.
- Event notifications are created in the same transaction as the action; every notification has a dedupe key so nothing is sent twice. Read notifications older than 90 days are pruned.
- **Due/overdue reminders** run from a daily Vercel Cron (`vercel.json` → `/api/cron/reminders`, 03:30 UTC ≈ 09:00 IST). Set `CRON_SECRET` in Vercel (any long random string); the endpoint returns 401/503 without it. As a fallback the app also runs the same idempotent job once a day after a logged-in page view.
- Email / SMS / push are **not** included (they need a provider account); the notification table is the single place to hook them in later.

## Scripts
`npm run dev | build | start | lint | typecheck | test | db:generate | db:migrate | admin:create | db:seed`

## Tests
`npm test` — 36 tests covering auth/lockout/sessions, tenant data isolation, bed/room capacity (service + DB constraints), invoice idempotency, partial/full payments, overpayment & void, discounts, carry-forward, electricity/water allocation & rounding, snapshots, overdue logic, vacate history preservation, and cash-vs-invoiced reports. DB tests run the real migrations on a temporary libSQL file.

## Performance notes
Server Components by default; client JS only for forms, nav, dialogs. No chart or UI-kit dependencies (system fonts, CSS bars). Indexed queries, selected columns only, joins instead of N+1, paginated lists (20/page). Personalised pages are dynamic and never shared-cached.
