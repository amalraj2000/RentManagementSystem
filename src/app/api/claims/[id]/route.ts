import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/session";
import { getClaimScreenshot } from "@/services/claims";

export const dynamic = "force-dynamic";

/** Payment-proof screenshot: admins any, a tenant only their own report; everything else is the same 404. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const shot = await getClaimScreenshot(getDb(), (await params).id, { id: user.id, role: user.role });
  if (!shot) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(shot.data), {
    headers: {
      "Content-Type": shot.mimeType,
      "Content-Length": String(shot.data.length),
      "Content-Disposition": `inline; filename="${shot.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
