import { currentMonth, MONTH_RE } from "./dates";

/** Every list shows this many rows per page; the pager only appears once there are more than this. */
export const PAGE_SIZE = 10;
export const pageParam = (v: string | string[] | undefined) => Math.max(1, Math.min(500, Number(Array.isArray(v) ? v[0] : v) || 1));
export const monthParam = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && MONTH_RE.test(s) ? s : currentMonth();
};
export const offsetFor = (page: number) => (page - 1) * PAGE_SIZE;

/** For small in-memory lists: returns the rows of one page plus the total, with the page clamped to what exists. */
export function slicePage<T>(rows: T[], page: number) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(page, pages);
  return { items: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), total, page: p };
}
