import { Bell, BedDouble, FileText, LayoutDashboard, Settings, Users, Wallet } from "lucide-react";
import { AppShell } from "@/components/nav";
import { UserMenu } from "@/components/user-menu";
import { logout } from "@/actions/auth";
import { getDb } from "@/db/client";
import { userPhotoVersion } from "@/services/avatars";
import { requireAdmin } from "@/lib/session";
import { NotificationBell } from "@/components/notification-bell";
import { scheduleDailyReminders } from "@/lib/reminders";

const items = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard /> },
  { href: "/admin/tenants", label: "Tenants", icon: <Users /> },
  { href: "/admin/rooms", label: "Rooms & beds", icon: <BedDouble /> },
  { href: "/admin/invoices", label: "Rent & bills", icon: <FileText /> },
  { href: "/admin/expenses", label: "Expenses", icon: <Wallet /> },
  { href: "/admin/announcements", label: "Announcements", icon: <Bell /> },
  { href: "/admin/settings", label: "Settings", icon: <Settings />, match: ["/admin/website", "/admin/admins", "/admin/logs"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  scheduleDailyReminders();
  const photoVersion = await userPhotoVersion(getDb(), user.id);
  const menu = items;
  return (
    <AppShell items={menu} bell={<NotificationBell userId={user.id} href="/admin/notifications" />} userMenu={<UserMenu name={user.name} email={user.email} roleLabel="Administrator" photoSrc={photoVersion ? `/api/avatars/${user.id}?v=${photoVersion}` : null} profileHref="/admin/profile" logoutAction={logout} />}>
      {children}
    </AppShell>
  );
}
