"use client";

import { useEffect } from "react";

/** Registers the service worker (needed for "install app" prompts and the offline page). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
