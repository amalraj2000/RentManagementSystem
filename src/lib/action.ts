import { z } from "zod";
import { AppError } from "@/services/common";

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string; field?: string; fields?: Record<string, string> };

/** Runs a server action body, mapping validation and AppErrors to safe messages. Unknown errors are logged and masked. */
export async function run(fn: () => Promise<string | void | { message?: string; data?: unknown }>): Promise<ActionResult> {
  try {
    const r = await fn();
    if (typeof r === "object" && r) return { ok: true, ...r };
    return { ok: true, message: r || "Saved" };
  } catch (e) {
    // next/navigation redirects are thrown as errors and must propagate.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof z.ZodError) {
      const fields: Record<string, string> = {};
      for (const i of e.issues) {
        const k = String(i.path[0] ?? "");
        if (k && !fields[k]) fields[k] = i.message;
      }
      return { ok: false, error: e.issues[0]?.message ?? "Invalid input", fields };
    }
    if (e instanceof AppError) return { ok: false, error: e.message, field: e.field };
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export const fd = (f: FormData) => Object.fromEntries([...f.entries()].filter(([, v]) => typeof v === "string"));
