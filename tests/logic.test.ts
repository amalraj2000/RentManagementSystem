import { describe, expect, it } from "vitest";
import { allocateUtility, invoiceStatus, unitsFromReadings } from "@/lib/billing";
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

describe("utility allocation", () => {
  const ids = ["a", "b", "c"];
  it("equal residents rounds exactly", () => {
    const r = allocateUtility(100000, "equal_residents", ids, ["a", "b"]);
    expect(r.map((x) => x.amountPaise).sort()).toEqual([33333, 33333, 33334]);
    expect(r.reduce((a, x) => a + x.amountPaise, 0)).toBe(100000);
  });
  it("equal beds uses bed holders only", () => {
    const r = allocateUtility(100001, "equal_beds", ids, ["a", "b"]);
    expect(r).toHaveLength(2);
    expect(r.reduce((a, x) => a + x.amountPaise, 0)).toBe(100001);
  });
  it("custom must add up and use eligible tenants", () => {
    expect(() => allocateUtility(1000, "custom", ids, [], { a: 400, b: 400 })).toThrow(/add up/);
    expect(() => allocateUtility(1000, "custom", ids, [], { zzz: 1000 })).toThrow(/eligible/);
    expect(allocateUtility(1000, "custom", ids, [], { a: 400, b: 600 })).toHaveLength(2);
  });
  it("errors when nobody is eligible", () => {
    expect(() => allocateUtility(1000, "equal_residents", [], [])).toThrow();
  });
  it("validates meter readings", () => {
    expect(unitsFromReadings(100, 250)).toBe(150);
    expect(unitsFromReadings(null, 250)).toBeNull();
    expect(() => unitsFromReadings(300, 250)).toThrow();
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

import { itemSettlement, monthsBetween } from "@/lib/billing";

describe("tenant ledger helpers", () => {
  it("lists every month from joining to now, newest first (across a year end)", () => {
    expect(monthsBetween("2026-10", "2027-02")).toEqual(["2027-02", "2027-01", "2026-12", "2026-11", "2026-10"]);
    expect(monthsBetween("2026-11", "2026-11")).toEqual(["2026-11"]);
    expect(monthsBetween("2026-12", "2026-11")).toEqual([]);
  });
  it("shows which lines of an invoice are covered by payments (rent first, discounts count as credit)", () => {
    const items = [
      { id: "rent", kind: "rent", amountPaise: 500000 },
      { id: "elec", kind: "electricity", amountPaise: 100000 },
      { id: "share", kind: "other", amountPaise: 20000 },
      { id: "disc", kind: "adjustment", amountPaise: -10000 },
    ];
    const none = itemSettlement(items, 0);
    expect(none.get("rent")!.status).toBe("unpaid");
    expect(none.get("disc")).toBeUndefined(); // discounts are not payable lines
    expect(none.get("rent")).toMatchObject({ payable: 490000, covered: 0 }); // the 100 discount comes off rent
    const rentOnly = itemSettlement(items, 490000);
    expect(rentOnly.get("rent")).toMatchObject({ status: "paid", covered: 490000 });
    expect(rentOnly.get("elec")!.status).toBe("unpaid");
    const partial = itemSettlement(items, 600000);
    expect(partial.get("elec")).toMatchObject({ status: "paid", covered: 100000 });
    expect(partial.get("share")).toMatchObject({ status: "partial", covered: 10000 });
    const all = itemSettlement(items, 610000);
    expect([...all.values()].every((v) => v.status === "paid")).toBe(true);
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

import { splitRentExpense } from "@/lib/billing";

describe("rent vs expenses split of a bill", () => {
  const parts = { rent: 500000, other: 220761, adjustment: 0 };
  const none = { rent: 0, expense: 0 };
  it("tracks rent and expenses separately: paying one never touches the other", () => {
    expect(splitRentExpense(parts, none)).toMatchObject({ rentPayable: 500000, rentBalance: 500000, expensePayable: 220761, expenseBalance: 220761 });
    // 1,000 paid toward EXPENSES does not reduce rent at all
    expect(splitRentExpense(parts, { rent: 0, expense: 100000 })).toMatchObject({ rentBalance: 500000, expenseCovered: 100000, expenseBalance: 120761 });
    expect(splitRentExpense(parts, { rent: 500000, expense: 0 })).toMatchObject({ rentBalance: 0, expenseBalance: 220761 });
    expect(splitRentExpense(parts, { rent: 500000, expense: 220761 })).toMatchObject({ rentBalance: 0, expenseBalance: 0 });
  });
  it("discounts come off rent first; paid amounts never exceed what is payable", () => {
    expect(splitRentExpense({ ...parts, adjustment: -50000 }, none)).toMatchObject({ rentPayable: 450000, expensePayable: 220761 });
    expect(splitRentExpense({ rent: 10000, other: 50000, adjustment: -30000 }, none)).toMatchObject({ rentPayable: 0, expensePayable: 30000 }); // a big discount spills into expenses
    expect(splitRentExpense(parts, { rent: 999999999, expense: 999999999 })).toMatchObject({ rentCovered: 500000, rentBalance: 0, expenseCovered: 220761, expenseBalance: 0 });
  });
  it("reported-but-unconfirmed payments are counted per purpose and never exceed the balance", () => {
    expect(splitRentExpense(parts, none, { rent: 300000, expense: 0 })).toMatchObject({ pendingRent: 300000, pendingExpense: 0 });
    expect(splitRentExpense(parts, none, { rent: 600000, expense: 50000 })).toMatchObject({ pendingRent: 500000, pendingExpense: 50000 });
    expect(splitRentExpense(parts, { rent: 500000, expense: 0 }, { rent: 999999999, expense: 999999999 })).toMatchObject({ pendingRent: 0, pendingExpense: 220761 });
  });
});

import { allocatePayment } from "@/lib/billing";
describe("which category a payment's money belongs to (reports)", () => {
  const items = [{ kind: "rent", amountPaise: 500000 }, { kind: "electricity", amountPaise: 100000 }, { kind: "water", amountPaise: 50000 }, { kind: "other", amountPaise: 20000 }];
  const z = { rent: 0, electricity: 0, water: 0, other: 0 };
  it("a rent payment is all rent; an expense payment is spread over the expense lines in order", () => {
    expect(allocatePayment(items, "rent", 300000, z)).toEqual({ rent: 300000, electricity: 0, water: 0, other: 0 });
    expect(allocatePayment(items, "expense", 120000, z)).toEqual({ rent: 0, electricity: 100000, water: 20000, other: 0 });
    expect(allocatePayment(items, "expense", 60000, { ...z, electricity: 100000 })).toEqual({ rent: 0, electricity: 0, water: 50000, other: 10000 }); // electricity already covered by an earlier payment
  });
});
