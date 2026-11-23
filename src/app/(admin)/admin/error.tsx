"use client";
import { Button } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-sm py-16 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mb-4 mt-1 text-sm text-muted">We couldn&apos;t load this page. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
