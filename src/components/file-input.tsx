"use client";

import { useRef, useState } from "react";
import { cn } from "@/components/ui";

const LIMIT = 1.5 * 1024 * 1024;

async function shrink(file: File): Promise<File> {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  for (let q = 0.85; q >= 0.5; q -= 0.1) {
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= LIMIT * 0.95) return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    scale *= 0.85;
  }
  throw new Error("too big");
}

/** File picker that downsizes big phone photos in the browser (PDFs and small images pass through untouched). */
export function FileInput({ name, accept, required, label }: { name: string; accept: string; required?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        name={name}
        accept={accept}
        required={required}
        aria-label={label}
        className={cn("block w-full rounded-lg border border-line bg-white text-sm file:mr-3 file:cursor-pointer file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200")}
        onChange={async (e) => {
          const input = e.currentTarget;
          const f = input.files?.[0];
          setNote(null);
          setBad(false);
          if (!f) return;
          try {
            let out = f;
            if (f.type.startsWith("image/") && f.size > 1024 * 1024) {
              out = await shrink(f);
              const dt = new DataTransfer();
              dt.items.add(out);
              input.files = dt.files;
              setNote(`Resized to ${(out.size / 1024).toFixed(0)} KB`);
            } else if (f.size > LIMIT) throw new Error("too big");
            else setNote(`${(f.size / 1024).toFixed(0)} KB`);
          } catch {
            input.value = "";
            setBad(true);
            setNote("File is too large (max 1.5 MB). Choose a smaller file or a photo instead of a PDF.");
          }
        }}
      />
      {note && <p className={cn("mt-1 text-xs", bad ? "text-red-700" : "text-muted")}>{note}</p>}
    </div>
  );
}
