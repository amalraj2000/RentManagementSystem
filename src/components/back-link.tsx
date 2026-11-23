import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <ChevronLeft className="size-4" aria-hidden /> {label}
    </Link>
  );
}
