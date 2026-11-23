import { UtilityPage } from "@/components/utility-page";
import { pageParam } from "@/lib/page";

export const metadata = { title: "Water" };

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return <UtilityPage type="water" page={pageParam((await searchParams).page)} />;
}
