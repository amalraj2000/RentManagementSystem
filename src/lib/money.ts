/** Money helpers. All amounts are integer paise. */

export function rupeesToPaise(input: string | number): number {
  const s = String(input).trim().replace(/[,₹\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error("Invalid amount");
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) throw new Error("Amount too large");
  return neg ? -paise : paise;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function formatINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = abs / 100;
  return `${sign}₹${abs % 100 === 0 ? inr.format(rupees) : rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function paiseToInput(paise: number): string {
  return (paise / 100).toFixed(2).replace(/\.00$/, "");
}

/**
 * Split `total` paise equally across `n` parts so parts sum exactly to total.
 * The remainder paise go one each to the first parts (deterministic).
 */
export function splitEqually(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total < 0) throw new Error("Total must be a non-negative integer");
  if (!Number.isInteger(n) || n <= 0) throw new Error("Need at least one recipient");
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
