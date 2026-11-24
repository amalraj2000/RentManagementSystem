"use client";

import { useState } from "react";
import { FileInput } from "@/components/file-input";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { paiseToInput } from "@/lib/money";

type T = {
  name?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string | null;
  joiningDate?: string;
  moveOutDate?: string | null;
  monthlyRentPaise?: number;
  securityDepositPaise?: number;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  status?: string;
};
export type BedRoom = { id: string; name: string; beds: { id: string; number: number; tenantId: string | null; tenantName: string | null }[] };

const ID_TYPE_OPTIONS = { aadhaar: "Aadhaar", pan: "PAN", voter: "Voter ID", driving_licence: "Driving licence", passport: "Passport", college_id: "College / office ID", other: "Other" };

/** One form for adding and editing a tenant: details, status, bed, password, photo and ID proof. */
export function TenantFields({
  t,
  defaultRentPaise,
  rooms,
  tenantId,
  currentBedId,
  defaultBedId,
  existingPhoto,
  existingIdCount,
}: {
  t?: T;
  defaultRentPaise?: number;
  rooms: BedRoom[];
  /** Set when editing. */
  tenantId?: string;
  currentBedId?: string | null;
  /** Preselected bed when adding. */
  defaultBedId?: string;
  existingPhoto?: string | null;
  existingIdCount?: number;
}) {
  const editing = !!tenantId;
  const [status, setStatus] = useState(t?.status ?? "active");
  const vacated = status === "moved_out";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name"><Input name="name" required minLength={2} maxLength={100} defaultValue={t?.name} /></Field>
      <Field label="Email (login)"><Input name="email" type="email" required defaultValue={t?.email} autoComplete="off" /></Field>
      <Field label="Mobile number"><Input name="phone" type="tel" required defaultValue={t?.phone} /></Field>
      <Field label="Date of birth (optional)"><Input name="dob" type="date" min="1900-01-01" max={today} defaultValue={t?.dateOfBirth ?? ""} /></Field>

      {editing && (
        <Field label="Status">
          <Select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            {t?.status === "notice" && <option value="notice">Notice period</option>}
            <option value="moved_out">Vacated</option>
          </Select>
        </Field>
      )}
      <Field label={vacated ? "Joining date / Vacated date" : "Joining date"}>
        <div className="flex gap-2">
          <Input name="joiningDate" type="date" required defaultValue={t?.joiningDate} />
          {vacated && <Input name="moveOutDate" type="date" required defaultValue={t?.moveOutDate ?? today} aria-label="Vacated date" />}
        </div>
      </Field>

      <Field label="Monthly rent (₹)"><Input name="monthlyRent" inputMode="decimal" required defaultValue={paiseToInput(t?.monthlyRentPaise ?? defaultRentPaise ?? 0)} /></Field>
      <Field label="Security deposit (₹)"><Input name="deposit" inputMode="decimal" required defaultValue={paiseToInput(t?.securityDepositPaise ?? 0)} /></Field>
      <Field label="Emergency contact name"><Input name="emergencyContactName" maxLength={100} defaultValue={t?.emergencyContactName ?? ""} /></Field>
      <Field label="Emergency contact number"><Input name="emergencyContactPhone" type="tel" defaultValue={t?.emergencyContactPhone ?? ""} /></Field>

      {!vacated && (
        <Field label="Bed" hint="Only vacant beds are selectable">
          <Select
            name="bedId"
            defaultValue={editing ? (currentBedId ?? "") : rooms.some((r) => r.beds.some((b) => b.id === defaultBedId && !b.tenantId)) ? defaultBedId : ""}
          >
            <option value="">{editing ? "No bed" : "Assign later"}</option>
            {rooms.map((r) => (
              <optgroup key={r.id} label={r.name}>
                {r.beds.map((b) => {
                  const taken = !!b.tenantId && b.tenantId !== tenantId;
                  return <option key={b.id} value={b.id} disabled={taken}>Bed {b.number}{taken ? ` — ${b.tenantName}` : ""}</option>;
                })}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
      <Field label={editing ? "New password (optional)" : "Temporary password"} hint={editing ? "Leave blank to keep the current password. Tenant must change a new one on first login." : "At least 10 characters. Tenant must change it on first login."}>
        <Input name="password" type="text" required={!editing} minLength={10} autoComplete="off" />
      </Field>

      <Field label="Profile photo (optional)" hint={existingPhoto ? `Current: ${existingPhoto}. Choosing a file replaces it.` : undefined}>
        <FileInput name="photo" accept="image/jpeg,image/png,image/webp" label="Profile photo" />
      </Field>
      <Field label="ID proof (optional)" hint={editing && existingIdCount ? `${existingIdCount} ID document(s) already on file. A new file is added to them.` : "JPG, PNG, WebP or PDF up to 1.5 MB each."}>
        <div className="space-y-2">
          <Select name="idType" defaultValue="aadhaar" aria-label="ID proof type">{Object.entries(ID_TYPE_OPTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <FileInput name="idProof" accept="image/jpeg,image/png,image/webp,application/pdf" label="ID proof file" />
        </div>
      </Field>

      <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" maxLength={500} defaultValue={t?.notes ?? ""} /></Field>
    </div>
  );
}
