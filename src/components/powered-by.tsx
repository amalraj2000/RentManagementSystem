import { cn } from "@/components/ui";

/** The maker's credit shown in footers. */
export function PoweredBy({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs text-muted", className)}>
      A product of{" "}
      <a href="https://softdestiny.vercel.app/" target="_blank" rel="noopener noreferrer" className="font-medium text-slate-600 underline-offset-2 hover:text-accent hover:underline">
        SoftDestiny Innovation Software Solution
      </a>
    </p>
  );
}
