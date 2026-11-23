import { z } from "zod";
import { DATE_RE, MONTH_RE } from "./dates";
import { rupeesToPaise } from "./money";

export const date = z.string().regex(DATE_RE, "Enter a valid date");
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
