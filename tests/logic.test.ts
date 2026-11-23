import { describe, expect, it } from "vitest";
import { allocateUtility, invoiceStatus, unitsFromReadings, waterfall } from "@/lib/billing";
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
  it("waterfall attributes cash to categories", () => {
    const items = [{ kind: "rent", amountPaise: 600 }, { kind: "electricity", amountPaise: 200 }, { kind: "adjustment", amountPaise: -100 }];
    const z = { rent: 0, electricity: 0, water: 0, other: 0 };
    expect(waterfall(items, 550, z)).toMatchObject({ rent: 500, electricity: 50 });
  });
});

describe("password policy", () => {
  it("rejects weak passwords", () => {
    expect(passwordProblem("short1")).toBeTruthy();
    expect(passwordProblem("allletterslong")).toBeTruthy();
    expect(passwordProblem("GoodPassw0rd")).toBeNull();
  });
});
