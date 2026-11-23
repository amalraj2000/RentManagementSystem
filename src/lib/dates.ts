/** Dates are ISO strings (YYYY-MM-DD) and months are YYYY-MM, in Asia/Kolkata for "today". */

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
export function currentMonth(now: Date = new Date()): string {
  return todayISO(now).slice(0, 7);
}
export function monthStart(month: string): string {
  return `${month}-01`;
}
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}
export function dueDateFor(month: string, dueDay: number): string {
  return `${month}-${String(Math.min(Math.max(dueDay, 1), 28)).padStart(2, "0")}`;
}
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}
/** "05 Sept" — day and month only, for tight spaces. */
export function formatDayMonth(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}
export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** "Nov ’26" — compact month for narrow screens. */
export function monthLabelShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", { month: "short", timeZone: "UTC" })} ’${String(y).slice(2)}`;
}
