import { redirect } from "next/navigation";

// Electricity & water are managed from Expenses (category + "Share with tenants"). Kept only so old links keep working.
export default function Page() {
  redirect("/admin/expenses");
}
