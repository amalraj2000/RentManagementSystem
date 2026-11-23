/**
 * The ONLY expense categories. Other (non-rent) expenses are fixed to these three.
 * Older records with a different category (if any) still display with a readable name.
 */
export const EXPENSE_CATEGORIES = ["electricity", "water", "cooking_gas"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<string, string> = {
  electricity: "Electricity",
  water: "Water",
  cooking_gas: "Gas cylinder",
  // legacy values, display only
  cleaning: "Cleaning",
  repairs: "Repairs & maintenance",
  internet: "Internet",
  other: "Other",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c.replace(/_/g, " ").replace(/^\w/, (x) => x.toUpperCase());

/** One readable line for an expense: just the category when no description was given, else "Category: description". */
export const expenseLine = (category: string, description: string) => {
  const label = categoryLabel(category);
  const d = description.trim();
  return !d || d === label ? label : `${label}: ${d}`;
};
