"use client";
import { useRouter } from "next/navigation";
import { MONTH_RE } from "@/lib/dates";

export function MonthPicker({ value, basePath }: { value: string; basePath: string }) {
  const router = useRouter();
  return (
    <input
      type="month"
      aria-label="Billing month"
      defaultValue={value}
      onChange={(e) => MONTH_RE.test(e.target.value) && router.push(`${basePath}?month=${e.target.value}`)}
      className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
    />
  );
}
