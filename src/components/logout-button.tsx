import { LogOut } from "lucide-react";
import { logout } from "@/actions/auth";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-slate-600 hover:text-ink">
        <LogOut className="size-4" aria-hidden /> Sign out
      </button>
    </form>
  );
}
