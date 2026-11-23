import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Login" };

/** There is no separate login page: logged-in people go to their dashboard, everyone else to the login pop-up on the home page. */
export default async function LoginPage() {
  const u = await getCurrentUser();
  redirect(u ? (u.role === "admin" ? "/admin" : "/portal") : "/?login=1");
}
