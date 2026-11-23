import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/session";
import { getDocumentForUser } from "@/services/documents";

export const dynamic = "force-dynamic";

/** Streams a private tenant file. Same 404 for "missing" and "not yours" so ids can't be probed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const { id } = await params;
  const doc = await getDocumentForUser(getDb(), id, { id: user.id, role: user.role });
  if (!doc) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
