import { z } from "zod";
import { DATE_RE, MONTH_RE } from "./dates";
import { rupeesToPaise } from "./money";

export const date = z.string().regex(DATE_RE, "Enter a valid date");
/** Optional date of birth: empty is fine; otherwise a real date between 1900 and today. */
export const dob = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || (DATE_RE.test(v) && v >= "1900-01-01" && v <= new Date().toISOString().slice(0, 10)), "Enter a valid date of birth");
/** Optional UPI id like name@bank. */
export const upiId = z
  .string()
  .trim()
  .max(100)
  .refine((v) => !v || /^[\w.\-]{2,100}@[A-Za-z][A-Za-z0-9.]{1,63}$/.test(v), "Enter a valid UPI id, like name@bank");
export const month = z.string().regex(MONTH_RE, "Enter a valid month");
export const money = z
  .string()
  .trim()
  .transform((v, ctx) => {
    try {
      return rupeesToPaise(v);
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter a valid amount (max 2 decimals)" });
      return z.NEVER;
    }
  });
export const positiveMoney = money.refine((n) => n > 0, "Amount must be greater than zero");
export const nonNegMoney = money.refine((n) => n >= 0, "Amount cannot be negative");
export const text = (max = 200) => z.string().trim().max(max);
export const optText = (max = 200) => text(max).optional().transform((v) => v || null);
export const phone = z.string().trim().regex(/^[+\d][\d\s-]{6,17}$/, "Enter a valid mobile number");
export const email = z.string().trim().toLowerCase().email("Enter a valid email").max(200);
export const id = z.string().trim().min(1).max(64);
export const optInt = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v?.trim()) return null;
    if (!/^\d+$/.test(v.trim())) {
      ctx.addIssue({ code: "custom", message: "Meter readings must be whole numbers" });
      return z.NEVER;
    }
    return Number(v.trim());
  });
