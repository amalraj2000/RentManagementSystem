"use client";

import { useState } from "react";
import { Check, Copy, Smartphone } from "lucide-react";
import { ChoiceChips, METHOD_CHOICES } from "@/components/choice-chips";
import { FileInput } from "@/components/file-input";
import { Field, Input } from "@/components/ui";

/** Builds the link that opens the user's UPI app with the payee and amount already filled in. */
function upiLink(upiId: string, payee: string, amount: string, note: string) {
  const n = Number(amount.replace(/,/g, ""));
  const q = new URLSearchParams({ pa: upiId, pn: payee || "PG owner", cu: "INR", tn: note });
  if (Number.isFinite(n) && n > 0) q.set("am", n.toFixed(2));
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

/**
 * The tenant's "I've paid" fields: amount, UPI or Cash, and — for UPI — the owner's UPI id with a button that opens the UPI app,
 * then a screenshot of the payment (required) to upload before tapping "I've paid".
 */
export function PayFields({ defaultAmount, upiId, payeeName, note }: { defaultAmount: string; upiId: string; payeeName: string; note: string }) {
  const [method, setMethod] = useState("upi");
  const [amount, setAmount] = useState(defaultAmount);
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Field label="Amount (₹)">
        <Input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 text-lg font-semibold" />
      </Field>
      <div>
        <span className="mb-2 block text-sm font-medium">How are you paying?</span>
        <ChoiceChips name="method" label="How are you paying" options={METHOD_CHOICES} value={method} onChange={setMethod} />
      </div>
      {method === "upi" ? (
        <>
          <div className="rounded-xl border border-accent/30 bg-accent-soft/40 p-4">
            {upiId ? (
              <>
                <p className="text-xs text-muted">Pay to this UPI id</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="min-w-0 break-all text-base font-semibold">{upiId}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard?.writeText(upiId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                {payeeName && <p className="mt-0.5 text-xs text-muted">{payeeName}</p>}
                <a href={upiLink(upiId, payeeName, amount, note)} className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
                  <Smartphone className="size-4" aria-hidden /> Pay with UPI app
                </a>
                <p className="mt-2 text-xs text-muted">On a computer, copy the UPI id and pay from your phone.</p>
              </>
            ) : (
              <p className="text-sm text-slate-700">The owner hasn&apos;t added a UPI id yet. Pay the way they told you, then upload the screenshot below.</p>
            )}
          </div>
          <div>
            <span className="mb-1 block text-sm font-medium">Payment screenshot</span>
            <p className="mb-2 text-xs text-muted">After paying, take a screenshot of the payment and upload it here, then tap <strong>I&apos;ve paid</strong>.</p>
            <FileInput name="screenshot" accept="image/jpeg,image/png,image/webp" label="Payment screenshot" required />
          </div>
        </>
      ) : (
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Give the cash to the owner, then tap <strong>I&apos;ve paid</strong>. It shows as paid once they confirm.</p>
      )}
    </>
  );
}
