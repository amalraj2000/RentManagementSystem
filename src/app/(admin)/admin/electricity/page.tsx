import { UtilityPage } from "@/components/utility-page";
import { pageParam } from "@/lib/page";

export const metadata = { title: "Electricity" };

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return <UtilityPage type="electricity" page={pageParam((await searchParams).page)} />;
}
