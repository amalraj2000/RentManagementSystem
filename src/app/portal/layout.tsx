import { Bell, CalendarDays, CreditCard, Home } from "lucide-react";
import { AppShell } from "@/components/nav";
import { Eye } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { stopImpersonationAction } from "@/actions/impersonate";
import { logout } from "@/actions/auth";
import { getDb } from "@/db/client";
import { photoIdFor } from "@/services/documents";
import { tenantForUser } from "@/services/portal";
import { requireTenant } from "@/lib/session";
import { NotificationBell } from "@/components/notification-bell";
import { scheduleDailyReminders } from "@/lib/reminders";

const items = [
  { href: "/portal", label: "Home", icon: <Home /> },
  { href: "/portal/rent", label: "Rent", icon: <CalendarDays /> },
  { href: "/portal/payments", label: "Payments", icon: <CreditCard /> },
  { href: "/portal/notices", label: "Notices", icon: <Bell /> },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTenant();
  scheduleDailyReminders();
  const me = await tenantForUser(getDb(), user.id);
  const photoId = me ? await photoIdFor(getDb(), me.id) : null;
  return (
    <AppShell items={items} bell={<NotificationBell userId={user.id} href="/portal/notifications" />} userMenu={<UserMenu name={user.name} email={user.email} roleLabel="Tenant" photoId={photoId} profileHref="/portal/profile" logoutAction={logout} />}>
      {user.impersonatedBy && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <span className="flex items-center gap-2"><Eye className="size-4 shrink-0" aria-hidden /> You are viewing as <strong>{user.name}</strong> (admin view). Changes are turned off.</span>
          <form action={stopImpersonationAction}><button className="rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-950">Back to admin</button></form>
        </div>
      )}
      {user.mustChangePassword && !user.impersonatedBy && <ForceBanner />}
      {children}
    </AppShell>
  );
}

function ForceBanner() {
  return (
    <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Please set a new password on the <a className="font-semibold underline" href="/portal/profile">Profile</a> page — you&apos;re using a temporary one.
    </div>
  );
}
