"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui";
export function PrintButton() {
  return (
    <Button variant="secondary" className="no-print" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Print
    </Button>
  );
}
