import { currentMonth, MONTH_RE } from "./dates";

export const PAGE_SIZE = 20;
export const pageParam = (v: string | string[] | undefined) => Math.max(1, Math.min(500, Number(Array.isArray(v) ? v[0] : v) || 1));
export const monthParam = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && MONTH_RE.test(s) ? s : currentMonth();
};
