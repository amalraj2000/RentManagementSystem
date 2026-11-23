# PG Manager

Fast, secure management for a small ladies' PG (2 bedrooms × 4 beds). Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Turso (libSQL) · Drizzle ORM · Zod. Deployable on Vercel.

- **Admin**: dashboard, tenants, rooms/beds, monthly invoices, partial/full payments + printable receipts, electricity & water bills with exact-rounding allocation, expenses, reports + CSV export, announcements, settings.
- **Tenant portal** (mobile-first): amount due, invoice breakdown, payment history, receipts, notices, profile, house rules, change password.
- All money is **integer paise**. Payments are **manual** — nothing is shown as "paid online" (no gateway is integrated).

## Local setup

```bash
npm install
cp .env.example .env.local        # fill in TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
npm run db:migrate                # applies ./drizzle migrations
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
- Receipts/attachments: no uploads are stored. "Bill reference" fields hold a bill number or link. (If you add uploads later, use external object storage such as Vercel Blob/R2 — not the Vercel filesystem.)

## Billing rules
- **Eligible for a month**: joined on/before month end and not moved out before month start.
- **Invoice generation is idempotent**: unique `(tenant, month)`; one rent item per invoice; one item per utility bill. Running "Generate invoices" repeatedly changes nothing. Old balances stay on their own invoices (carried forward by being listed as outstanding), never re-charged.
- **Status**: paid (balance ≤ 0) · overdue (balance > 0 and today is after the due date, even if partly paid) · partial · unpaid. A bill is due *on* its due date.
- **Utilities**: one bill per (type, month). Allocation (equal residents / equal occupied beds [electricity] / custom) is computed once, rounded so shares sum exactly to the bill total (remainder paise go to the first tenants), and saved as a snapshot — later changes to residents never alter old bills. A utility bill auto-creates a matching expense (counted once). Meter readings are validated (closing ≥ opening). Utility bills can be deleted only if no payment exists on the affected invoices.
- **Payments** can't exceed the balance. They're never deleted: voiding keeps the row (with reason) and removes it from totals.
- **Reports**: *cash collected* = non-voided payments by payment date, attributed to rent/electricity/water/other by a rent→electricity→water→other waterfall per invoice. *Invoiced* is shown separately and is never treated as income.
- Rent is billed as a full month (no pro-rating for mid-month joins) — adjust with a discount line if needed.
- `invoices.total_paise/paid_paise` are denormalised for fast dashboards and recomputed inside the same transaction as every write.

## Scripts
`npm run dev | build | start | lint | typecheck | test | db:generate | db:migrate | admin:create | db:seed`

## Tests
`npm test` — 36 tests covering auth/lockout/sessions, tenant data isolation, bed/room capacity (service + DB constraints), invoice idempotency, partial/full payments, overpayment & void, discounts, carry-forward, electricity/water allocation & rounding, snapshots, overdue logic, move-out history preservation, and cash-vs-invoiced reports. DB tests run the real migrations on a temporary libSQL file.

## Performance notes
Server Components by default; client JS only for forms, nav, dialogs. No chart or UI-kit dependencies (system fonts, CSS bars). Indexed queries, selected columns only, joins instead of N+1, paginated lists (20/page). Personalised pages are dynamic and never shared-cached.
