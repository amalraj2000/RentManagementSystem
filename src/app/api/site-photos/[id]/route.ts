import { getDb } from "@/db/client";
import { getSitePhoto } from "@/services/website";

/** PUBLIC on purpose: these are the owner's landing-page photos. Random ids; only images are ever stored here. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const photo = await getSitePhoto(getDb(), (await params).id);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
