import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/session";
import { getReceiptImage } from "@/services/misc";

export const dynamic = "force-dynamic";

/** Expense receipt image — admins only. Tenants get the same 404 as a missing file. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.role !== "admin") return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const img = await getReceiptImage(getDb(), (await params).id);
  if (!img) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(img.data), {
    headers: {
      "Content-Type": img.mimeType,
      "Content-Length": String(img.data.length),
      "Content-Disposition": `inline; filename="${img.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
