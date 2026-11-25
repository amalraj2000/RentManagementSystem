"use client";

import { useEffect, useState } from "react";
import { isInstalledMobile, pushSupported, syncPushSubscription } from "@/lib/pwa-client";

const KEY = "push-prompt-later";
const WEEK = 7 * 86400_000;

/** "Get updates" prompt, shown only in the installed phone app after login. Already allowed → quietly re-syncs this device to the current user. */
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isInstalledMobile() || !pushSupported()) return;
    if (Notification.permission === "granted") {
      syncPushSubscription().catch(() => {});
      return;
    }
    if (Notification.permission !== "default") return;
    let later = 0;
    try { later = Number(localStorage.getItem(KEY)) || 0; } catch { /* storage blocked */ }
    if (Date.now() - later < WEEK) return;
    fetch("/api/push/key").then((r) => r.ok && setShow(true)).catch(() => {}); // only offer it when the server has push configured
  }, []);

  if (!show) return null;
  const hide = () => setShow(false);
  const notNow = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    hide();
  };
  // requestPermission must be called straight from the tap (iOS requirement), so no await before it.
  const turnOn = () => {
    Notification.requestPermission().then((p) => (p === "granted" ? syncPushSubscription() : null)).catch(() => {}).finally(hide);
  };
  return (
    <div role="dialog" aria-label="Get updates" className="fixed inset-x-3 z-[90] flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-lg" style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
      <span className="font-medium">Get updates about rent, bills and notices?</span>
      <span className="flex gap-2">
        <button type="button" onClick={notNow} className="rounded-lg px-3 py-1.5 text-muted hover:bg-slate-100">Not now</button>
        <button type="button" onClick={turnOn} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-white hover:bg-accent-hover">Turn on</button>
      </span>
    </div>
  );
}
