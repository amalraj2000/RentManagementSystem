"use client";

/** True only inside the installed iPhone / Android app (never a browser tab or desktop). */
export function isInstalledMobile() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return standalone && (ios || /Android/.test(ua));
}

export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const b64ToBytes = (s: string) => {
  const raw = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** Subscribes this device (reusing an existing subscription) and saves it for the logged-in user. Returns false if push is not set up. */
export async function syncPushSubscription() {
  const k = await fetch("/api/push/key").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!k?.key) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.key) }));
  const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
  return r.ok;
}

/** Called on logout so a shared phone stops receiving the previous user's alerts. */
export async function unsubscribePush() {
  try {
    if (!pushSupported()) return;
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }), keepalive: true });
    await sub.unsubscribe();
  } catch {
    /* best-effort */
  }
}
