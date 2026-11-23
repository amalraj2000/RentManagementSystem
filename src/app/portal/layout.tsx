import { Bell, CreditCard, FileText, Home, User } from "lucide-react";
import { AppShell } from "@/components/nav";
import { LogoutButton } from "@/components/logout-button";
import { requireTenant } from "@/lib/session";

const items = [
  { href: "/portal", label: "Home", icon: <Home /> },
  { href: "/portal/invoices", label: "Invoices", icon: <FileText /> },
  { href: "/portal/payments", label: "Payments", icon: <CreditCard /> },
  { href: "/portal/notices", label: "Notices", icon: <Bell /> },
  { href: "/portal/profile", label: "Profile", icon: <User /> },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTenant();
  return (
    <AppShell items={items} brand="My PG" user={user.name} logout={<LogoutButton />}>
      {user.mustChangePassword && <ForceBanner />}
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
