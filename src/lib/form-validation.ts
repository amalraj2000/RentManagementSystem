/** Browser-side, per-field validation that renders its message directly under the field. */

type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const AMOUNT = /^\d{1,9}(\.\d{1,2})?$/;
const PHONE = /^[+\d][\d\s-]{6,17}$/;

/** Returns an error message, or null when the field is fine. */
export function problemWith(el: El, form: HTMLFormElement): string | null {
  const v = el.value;
  const isText = el instanceof HTMLInputElement && !["checkbox", "radio", "file", "hidden", "date", "month"].includes(el.type);
  const label = (el.getAttribute("aria-label") || "").trim();
  if (el.required) {
    if (el instanceof HTMLInputElement && el.type === "file") { if (!el.files?.length) return "Please choose a file"; }
    else if (el instanceof HTMLInputElement && el.type === "checkbox") { if (!el.checked) return "Please tick this box"; }
    else if (el instanceof HTMLSelectElement) { if (!v) return "Please select an option"; }
    else if (!v.trim()) return label ? `${label} is required` : "This field is required";
  }
  if (!v.trim() || el instanceof HTMLSelectElement) return null;
  if (el instanceof HTMLInputElement) {
    if (el.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())) return "Enter a valid email address, like name@example.com";
    if (el.type === "tel" && !PHONE.test(v.trim())) return "Enter a valid mobile number (digits, optional +91)";
    if ((el.type === "date" || el.type === "month") && !el.validity.valid) return el.type === "date" ? "Enter a valid date" : "Enter a valid month";
    if (el.inputMode === "decimal" && !AMOUNT.test(v.trim().replace(/,/g, ""))) return "Enter a valid amount, like 1500 or 1500.50";
    if (el.inputMode === "numeric" && !/^\d+$/.test(v.trim())) return "Enter whole numbers only";
    if (el.type === "number") {
      if (el.validity.rangeUnderflow || el.validity.rangeOverflow) return `Enter a number between ${el.min} and ${el.max}`;
      if (el.validity.badInput) return "Enter a valid number";
    }
  }
  if (isText || el instanceof HTMLTextAreaElement) {
    if (el.minLength > 0 && v.length < el.minLength) return `Use at least ${el.minLength} characters (you have ${v.length})`;
    if (el.maxLength > 0 && v.length > el.maxLength) return `Use at most ${el.maxLength} characters`;
  }
  if (el.name === "confirm") {
    const other = form.elements.namedItem("next") as HTMLInputElement | null;
    if (other && other.value !== v) return "Passwords do not match";
  }
  return null;
}

const idFor = (el: El) => `err-${el.name || el.id}`;

export function clearError(el: El) {
  el.removeAttribute("aria-invalid");
  const d = el.getAttribute("aria-describedby");
  if (d?.includes("err-")) {
    document.getElementById(d.split(" ").find((x) => x.startsWith("err-"))!)?.remove();
    el.setAttribute("aria-describedby", d.split(" ").filter((x) => !x.startsWith("err-")).join(" "));
    if (!el.getAttribute("aria-describedby")) el.removeAttribute("aria-describedby");
  }
  el.classList.remove("!border-red-500");
}

export function showError(el: El, message: string) {
  clearError(el);
  const p = document.createElement("p");
  p.id = idFor(el);
  p.setAttribute("role", "alert");
  p.className = "mt-1 text-xs font-medium text-red-700";
  p.textContent = message;
  el.after(p);
  el.setAttribute("aria-invalid", "true");
  el.setAttribute("aria-describedby", [el.getAttribute("aria-describedby"), p.id].filter(Boolean).join(" "));
  el.classList.add("!border-red-500");
}

export const fieldsOf = (form: HTMLFormElement) =>
  [...form.elements].filter((e): e is El => (e instanceof HTMLInputElement || e instanceof HTMLSelectElement || e instanceof HTMLTextAreaElement) && !!e.name && e.type !== "hidden" && !e.disabled);

/** Validates every field; shows messages; returns the first invalid element (or null). */
export function validateForm(form: HTMLFormElement): El | null {
  let first: El | null = null;
  for (const el of fieldsOf(form)) {
    const msg = problemWith(el, form);
    if (msg) { showError(el, msg); first ??= el; } else clearError(el);
  }
  return first;
}

export function attachLiveValidation(form: HTMLFormElement): () => void {
  const onBlur = (e: Event) => {
    const el = e.target as El;
    if (!fieldsOf(form).includes(el)) return;
    const msg = problemWith(el, form);
    msg ? showError(el, msg) : clearError(el);
  };
  const onInput = (e: Event) => {
    const el = e.target as El;
    if (el.getAttribute("aria-invalid") !== "true") return; // only re-check fields already flagged
    const msg = problemWith(el, form);
    msg ? showError(el, msg) : clearError(el);
    // a changed "next" password can fix/break the confirm field
    if (el.name === "next") { const c = form.elements.namedItem("confirm") as El | null; if (c?.getAttribute("aria-invalid") === "true" && !problemWith(c, form)) clearError(c); }
  };
  form.addEventListener("focusout", onBlur);
  form.addEventListener("input", onInput);
  form.addEventListener("change", onInput);
  return () => { form.removeEventListener("focusout", onBlur); form.removeEventListener("input", onInput); form.removeEventListener("change", onInput); };
}
