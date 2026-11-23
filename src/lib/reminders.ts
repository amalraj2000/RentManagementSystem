import "server-only";
import { after } from "next/server";
import { getDb } from "@/db/client";
import { todayISO } from "./dates";
import { runReminders } from "@/services/notifications";

let lastRun = "";

/** Best-effort: once per day per warm instance, after the response is sent. The cron job is the reliable trigger; dedupe keys make repeats harmless. */
export function scheduleDailyReminders() {
  const today = todayISO();
  if (lastRun === today) return;
  lastRun = today;
  after(async () => {
    try {
      await runReminders(getDb(), today);
    } catch (e) {
      lastRun = "";
      console.error("[reminders]", e);
    }
  });
}
