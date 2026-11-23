import { UtilityEdit } from "@/components/utility-page";

export const metadata = { title: "Edit water bill" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <UtilityEdit type="water" id={(await params).id} />;
}
