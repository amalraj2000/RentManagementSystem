/** The facilities shown on the landing page. The owner switches each one on or off under Settings → Website. */
export const FACILITIES = [
  { key: "bedrooms", label: "Bedrooms", hint: "Number of bedrooms and beds" },
  { key: "bathrooms", label: "Attached bathrooms", hint: "Shown only when every bedroom has one" },
  { key: "kitchen", label: "Shared kitchen" },
  { key: "hall", label: "Shared hall" },
  { key: "sitout", label: "Sit-out" },
  { key: "fridge", label: "Fridge" },
  { key: "washing", label: "Washing machine" },
  { key: "purifier", label: "Water purifier" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "cctv", label: "CCTV at the front gate" },
] as const;

export type FacilityKey = (typeof FACILITIES)[number]["key"];
export const FACILITY_KEYS: string[] = FACILITIES.map((f) => f.key);

/** What is stored is the list of facilities that are switched OFF, so a facility added later is on by default. */
export function parseHidden(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && FACILITY_KEYS.includes(x)) : [];
  } catch {
    return [];
  }
}
