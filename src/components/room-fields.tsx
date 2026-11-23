import { Field, Input, Select } from "@/components/ui";
import { ROOM_ADD_DELETE_ENABLED } from "@/lib/features";

export function RoomFields({ r }: { r?: { name: string; maxOccupancy: number; hasAttachedBathroom: boolean } }) {
  return (
    <div className="space-y-3">
      <Field label="Room name" hint="For example “Bedroom 1” or “Ground floor room”."><Input name="name" required maxLength={60} defaultValue={r?.name} /></Field>
      {ROOM_ADD_DELETE_ENABLED ? (
        <Field label="Number of beds" hint="1 to 4. This is the room's capacity.">
          <Select name="bedCount" defaultValue={String(r?.maxOccupancy ?? 4)}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} bed{n > 1 ? "s" : ""}</option>)}
          </Select>
        </Field>
      ) : (
        // DISABLED — adding / removing beds is switched off. The bed count is kept as it is (see src/lib/features.ts).
        <input type="hidden" name="bedCount" value={r?.maxOccupancy ?? 4} />
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="bathroom" defaultChecked={r?.hasAttachedBathroom ?? true} className="size-4 accent-teal-700" /> Attached bathroom</label>
    </div>
  );
}
