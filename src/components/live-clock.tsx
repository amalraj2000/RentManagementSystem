"use client";

import { useEffect, useState } from "react";

const dateFmt = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/** Today's date and the current time (India time). The time appears after load and updates every few seconds. */
export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0); // after mount, so the server and first client render match
    const every = setInterval(tick, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return (
    <p className="text-sm text-muted">
      <span suppressHydrationWarning>{dateFmt.format(now ?? new Date())}</span>
      <span aria-hidden> · </span>
      <span className="inline-block min-w-16 tabular-nums">{now ? timeFmt.format(now).toLowerCase() : ""}</span>
    </p>
  );
}
