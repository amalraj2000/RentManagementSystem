import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/session";
import { getUserPhoto } from "@/services/avatars";

export const dynamic = "force-dynamic";

/** Profile photo of a login user. Logged-in only; admins can see anyone's, others only their own (same 404 otherwise). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  const photo = await getUserPhoto(getDb(), (await params).id, { id: user.id, role: user.role });
  if (!photo) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(photo.data), {
    headers: { "Content-Type": photo.mimeType, "Content-Length": String(photo.data.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "default-src 'none'; img-src 'self'" },
  });
}
