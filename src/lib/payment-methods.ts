/** How a payment was made, in plain words for screens and receipts. */
export const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", bank_transfer: "Bank transfer", other: "Other" };
export const methodLabel = (m: string) => METHOD_LABEL[m] ?? m.replace(/_/g, " ");
