/** Expense categories — one list used by the DB type, forms, lists and tenant bills. */
export const EXPENSE_CATEGORIES = ["electricity", "water", "cooking_gas", "cleaning", "repairs", "internet", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  electricity: "Electricity",
  water: "Water",
  cooking_gas: "Cooking gas (LPG)",
  cleaning: "Cleaning",
  repairs: "Repairs & maintenance",
  internet: "Internet",
  other: "Other",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c as ExpenseCategory] ?? c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());
