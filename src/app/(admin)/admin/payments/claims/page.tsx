import { redirect } from "next/navigation";

// Reported payments now live on the main Payments page (filter: Waiting for confirmation). Kept so old links still work.
export default function ClaimsRedirect() {
  redirect("/admin/payments?show=waiting");
}
