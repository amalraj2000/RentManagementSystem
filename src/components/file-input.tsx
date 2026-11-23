"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
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

type Preview = { url: string | null; name: string; size: string };

/**
 * File picker that downsizes big phone photos in the browser and shows a PREVIEW of the chosen image underneath
 * (PDFs show their file name). The preview clears on "Remove" and when the form is reset after saving.
 */
export function FileInput({ name, accept, required, label }: { name: string; accept: string; required?: boolean; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const urlRef = useRef<string | null>(null);

  const drop = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPreview(null);
  };
  const show = (f: File) => {
    drop();
    const isImage = f.type.startsWith("image/");
    const url = isImage ? URL.createObjectURL(f) : null;
    urlRef.current = url;
    setPreview({ url, name: f.name, size: f.size >= 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB` });
  };

  // when the surrounding form is reset (after a successful save) the preview must go too
  useEffect(() => {
    const form = ref.current?.form;
    const onReset = () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPreview(null);
      setNote(null);
      setBad(false);
    };
    form?.addEventListener("reset", onReset);
    return () => {
      form?.removeEventListener("reset", onReset);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

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
          if (!f) {
            drop();
            return;
          }
          try {
            let out = f;
            if (f.type.startsWith("image/") && f.size > 1024 * 1024) {
              out = await shrink(f);
              const dt = new DataTransfer();
              dt.items.add(out);
              input.files = dt.files;
              setNote(`Resized to ${(out.size / 1024).toFixed(0)} KB`);
            } else if (f.size > LIMIT) throw new Error("too big");
            else setNote(null);
            show(out);
          } catch {
            input.value = "";
            drop();
            setBad(true);
            setNote("File is too large (max 1.5 MB). Choose a smaller file or a photo instead of a PDF.");
          }
        }}
      />
      {note && <p className={cn("mt-1 text-xs", bad ? "text-red-700" : "text-muted")}>{note}</p>}
      {preview && (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-line bg-white p-2">
          {preview.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview of the file the user just chose
            <a href={preview.url} target="_blank" rel="noopener" title="Open full size" className="shrink-0"><img src={preview.url} alt={`Preview of ${preview.name}`} className="size-14 rounded-md border border-line object-cover" /></a>
          ) : (
            <span className="grid size-14 shrink-0 place-items-center rounded-md bg-slate-100 text-muted"><FileText className="size-6" aria-hidden /></span>
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium text-ink">{preview.name}</p>
            <p className="text-muted">{preview.size}</p>
          </div>
          <button
            type="button"
            aria-label="Remove the chosen file"
            className="rounded-md p-1.5 text-muted hover:bg-slate-100 hover:text-ink"
            onClick={() => {
              if (ref.current) ref.current.value = "";
              drop();
              setNote(null);
            }}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
