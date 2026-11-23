import { Bell, BedDouble, CreditCard, FileText, Droplets, LayoutDashboard, Settings, Users, Wallet, Zap, BarChart3 } from "lucide-react";
import { AppShell } from "@/components/nav";
import { LogoutButton } from "@/components/logout-button";
import { requireAdmin } from "@/lib/session";

const items = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard /> },
  { href: "/admin/tenants", label: "Tenants", icon: <Users /> },
  { href: "/admin/rooms", label: "Rooms & beds", icon: <BedDouble /> },
  { href: "/admin/invoices", label: "Rent & invoices", icon: <FileText /> },
  { href: "/admin/electricity", label: "Electricity", icon: <Zap /> },
  { href: "/admin/water", label: "Water", icon: <Droplets /> },
  { href: "/admin/payments", label: "Payments", icon: <CreditCard /> },
  { href: "/admin/expenses", label: "Expenses", icon: <Wallet /> },
  { href: "/admin/reports", label: "Reports", icon: <BarChart3 /> },
  { href: "/admin/announcements", label: "Announcements", icon: <Bell /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings /> },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <AppShell items={items} brand="PG Manager" user={user.name} logout={<LogoutButton />}>
      {children}
    </AppShell>
  );
}
