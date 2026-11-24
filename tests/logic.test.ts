import { describe, expect, it } from "vitest";
import { invoiceStatus } from "@/lib/billing";
import { formatINR, rupeesToPaise, splitEqually } from "@/lib/money";
import { dueDateFor, monthEnd } from "@/lib/dates";
import { passwordProblem } from "@/lib/auth-core";

describe("money", () => {
  it("parses rupees to integer paise without float error", () => {
    expect(rupeesToPaise("0.10")).toBe(10);
    expect(rupeesToPaise("1,234.5")).toBe(123450);
    expect(rupeesToPaise("19.99")).toBe(1999);
    expect(() => rupeesToPaise("1.234")).toThrow();
    expect(() => rupeesToPaise("abc")).toThrow();
  });
  it("formats INR", () => {
    expect(formatINR(150000)).toBe("₹1,500");
    expect(formatINR(150050)).toBe("₹1,500.50");
  });
  it("splits so shares always sum to total", () => {
    for (const [t, n] of [[100000, 3], [100001, 8], [1, 8], [0, 3], [999999, 7]] as const) {
      const s = splitEqually(t, n);
      expect(s.reduce((a, b) => a + b, 0)).toBe(t);
      expect(Math.max(...s) - Math.min(...s)).toBeLessThanOrEqual(1);
    }
  });
});

describe("invoice status & dates", () => {
  const base = { totalPaise: 1000, dueDate: "2026-03-05" };
  it("covers unpaid / partial / paid / overdue", () => {
    expect(invoiceStatus({ ...base, paidPaise: 0 }, "2026-03-01")).toBe("unpaid");
    expect(invoiceStatus({ ...base, paidPaise: 400 }, "2026-03-01")).toBe("partial");
    expect(invoiceStatus({ ...base, paidPaise: 1000 }, "2026-04-01")).toBe("paid");
    expect(invoiceStatus({ ...base, paidPaise: 0 }, "2026-03-05")).toBe("unpaid"); // due today is not overdue
    expect(invoiceStatus({ ...base, paidPaise: 0 }, "2026-03-06")).toBe("overdue");
    expect(invoiceStatus({ ...base, paidPaise: 400 }, "2026-03-06")).toBe("overdue");
  });
  it("month helpers", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(dueDateFor("2026-03", 31)).toBe("2026-03-28");
  });
});

describe("password policy", () => {
  it("rejects weak passwords", () => {
    expect(passwordProblem("short1")).toBeTruthy();
    expect(passwordProblem("allletterslong")).toBeNull(); // no letters+numbers requirement
    expect(passwordProblem("divya@gmail.com")).toBeNull();
    expect(passwordProblem("1234567890")).toBeNull();
    expect(passwordProblem("GoodPassw0rd")).toBeNull();
  });
});

import { generateTempPassword, loginMessage, whatsappLink, whatsappNumber } from "@/lib/share";

describe("WhatsApp share helpers", () => {
  it("normalises Indian numbers and builds the link", () => {
    expect(whatsappNumber("98765 43210")).toBe("919876543210");
    expect(whatsappNumber("+91 98765-43210")).toBe("919876543210");
    expect(whatsappNumber("09876543210")).toBe("919876543210");
    expect(whatsappNumber("+44 7700 900123")).toBe("447700900123");
    expect(whatsappNumber("123")).toBeNull();
    const msg = loginMessage({ name: "Asha", url: "https://pg.example/login", email: "a@x.test", password: "Abc123xyz9" });
    expect(msg).toContain("Username: a@x.test");
    expect(msg).toContain("Temporary password: Abc123xyz9");
    const link = whatsappLink("9876543210", msg);
    expect(link.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(link.split("text=")[1])).toBe(msg);
  });
  it("generates strong, unambiguous, unique temporary passwords", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(set.size).toBe(200);
    for (const p of set) { expect(p).toHaveLength(10); expect(p).toMatch(/^[a-km-zA-HJ-NP-Z2-9]+$/); }
    expect(passwordProblem(generateTempPassword())).toBeNull(); // always satisfies the password policy
  });
});

import { monthsBetween } from "@/lib/billing";

describe("tenant ledger helpers", () => {
  it("lists every month from joining to now, newest first (across a year end)", () => {
    expect(monthsBetween("2026-10", "2027-02")).toEqual(["2027-02", "2027-01", "2026-12", "2026-11", "2026-10"]);
    expect(monthsBetween("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(monthsBetween("2026-12", "2026-11")).toEqual([]);
  });
});

import { rentState } from "@/lib/billing";
import { slicePage, PAGE_SIZE } from "@/lib/page";

describe("tenant rent status", () => {
  const inv = (total: number, paid: number, due = "2026-11-05") => ({ totalPaise: total, paidPaise: paid, dueDate: due });
  it("Paid only when the balance is cleared; Waiting only when a reported payment covers what is left", () => {
    expect(rentState(inv(1000, 1000), 0, "2026-11-20")).toBe("paid");
    expect(rentState(inv(1000, 0), 1000, "2026-11-20")).toBe("waiting"); // reported in full, not yet confirmed
    expect(rentState(inv(1000, 0), 400, "2026-11-20")).toBe("overdue"); // a part-report doesn't hide that it's late
    expect(rentState(inv(1000, 0), 0, "2026-11-20")).toBe("overdue");
    expect(rentState(inv(1000, 0), 0, "2026-11-05")).toBe("unpaid"); // due today is not late yet
    expect(rentState(inv(1000, 300), 0, "2026-11-01")).toBe("partial");
    expect(rentState(inv(1000, 600), 400, "2026-11-20")).toBe("waiting"); // the remaining 400 has been reported
  });
});

describe("pagination helper", () => {
  it("pages of 10, clamps to the last page, and handles empty lists", () => {
    const rows = Array.from({ length: 23 }, (_, i) => i + 1);
    expect(PAGE_SIZE).toBe(10);
    expect(slicePage(rows, 1)).toMatchObject({ total: 23, page: 1, items: rows.slice(0, 10) });
    expect(slicePage(rows, 3).items).toEqual([21, 22, 23]);
    expect(slicePage(rows, 99)).toMatchObject({ page: 3, items: [21, 22, 23] }); // past the end -> last page
    expect(slicePage([], 5)).toMatchObject({ total: 0, page: 1, items: [] });
    expect(slicePage(rows.slice(0, 10), 1).total).toBe(10); // exactly one page: the pager stays hidden
  });
});

import * as Sch from "@/lib/schemas";
describe("date of birth and UPI id validation", () => {
  it("dob is optional, must be a real past date", () => {
    expect(Sch.dob.parse("")).toBeNull();
    expect(Sch.dob.parse(undefined)).toBeNull();
    expect(Sch.dob.parse("1999-05-20")).toBe("1999-05-20");
    expect(() => Sch.dob.parse("1850-01-01")).toThrow();
    expect(() => Sch.dob.parse("2999-01-01")).toThrow();
    expect(() => Sch.dob.parse("not a date")).toThrow();
  });
  it("accepts normal UPI ids and rejects nonsense", () => {
    for (const ok of ["", "name@okbank", "9876543210@ybl", "first.last-1@oksbi"]) expect(Sch.upiId.safeParse(ok).success).toBe(true);
    for (const bad of ["name", "@bank", "a b@bank", "name@"]) expect(Sch.upiId.safeParse(bad).success).toBe(false);
  });
});
