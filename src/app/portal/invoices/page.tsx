import { redirect } from "next/navigation";

// "Invoices" became the month-by-month Rent page. Kept so old links and notifications still work.
export default function PortalInvoices() {
  redirect("/portal/rent");
}
