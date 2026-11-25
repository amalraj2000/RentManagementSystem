"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isInstalledMobile } from "@/lib/pwa-client";

const noSubscribe = () => () => {};

/** Registers the service worker and, in the installed phone app only, shows the offline and "new version" banners. */
export function SwRegister() {
  const installed = useSyncExternalStore(noSubscribe, isInstalledMobile, () => false);
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    if (!navigator.onLine) off();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);

    let timer: ReturnType<typeof setInterval> | undefined;
    let onVisible: (() => void) | undefined;
    let reloading = false;
    if ("serviceWorker" in navigator) {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!hadController || reloading) return; // first install just takes control; no reload needed
        reloading = true;
        location.reload();
      });
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
        const watch = (w: ServiceWorker | null) => w?.addEventListener("statechange", () => w.state === "installed" && navigator.serviceWorker.controller && setWaiting(w));
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => watch(reg.installing));
        const check = () => reg.update().catch(() => {});
        timer = setInterval(check, 30 * 60 * 1000);
        onVisible = () => document.visibilityState === "visible" && check();
        document.addEventListener("visibilitychange", onVisible);
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      if (timer) clearInterval(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!installed) return null;
  return (
    <>
      {offline && (
        <div role="status" className="pwa-banner fixed inset-x-0 top-0 z-[100] bg-slate-800 px-4 pb-2 text-center text-sm font-medium text-white" style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}>
          You&apos;re offline — showing saved pages
        </div>
      )}
      {waiting && (
        <div role="status" className="fixed inset-x-3 z-[100] flex items-center justify-between gap-3 rounded-xl bg-accent px-4 py-3 text-sm font-medium text-white shadow-lg" style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
          <span>A new version is available</span>
          <button type="button" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-accent">Refresh</button>
        </div>
      )}
    </>
  );
}
