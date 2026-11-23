import { UtilityEdit } from "@/components/utility-page";

export const metadata = { title: "Edit electricity bill" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <UtilityEdit type="electricity" id={(await params).id} />;
}
