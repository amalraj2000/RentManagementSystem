import { Download, Eye, FileText } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { FileInput } from "@/components/file-input";
import { Card, Field, Select, iconButtonClass } from "@/components/ui";
import { deleteDocumentAction, uploadDocumentAction } from "@/actions/admin";
import { removeMyPhotoAction, updateMyPhotoAction } from "@/actions/portal";
import { ID_TYPES } from "@/services/documents";

type Doc = { id: string; kind: "photo" | "id_proof"; idType: string | null; fileName: string; mimeType: string; sizeBytes: number; createdAt: Date };
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/** Admin: manage a tenant's photo and ID proofs. */
/** `self` = the tenant looking at their own card: they may change their photo, but ID documents stay read-only. */
export function DocumentsCard({ tenantId, name, docs, readOnly, self }: { tenantId: string; name: string; docs: Doc[]; readOnly?: boolean; self?: boolean }) {
  const canEditPhoto = !readOnly || !!self;
  const photo = docs.find((d) => d.kind === "photo");
  const ids = docs.filter((d) => d.kind === "id_proof");
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">Photo &amp; ID proof</h2>
      <div className="flex items-center gap-3">
        <Avatar photoId={photo?.id} name={name} className="size-16 text-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted">{photo ? `${photo.fileName} · ${kb(photo.sizeBytes)}` : "No photo yet"}</p>
        </div>
        {photo && canEditPhoto && <ConfirmButton label="Delete" title="Remove your profile photo?" action={self ? removeMyPhotoAction : deleteDocumentAction.bind(null, photo.id)} confirmLabel="Remove" />}
      </div>
      {canEditPhoto && (
        <ActionForm action={self ? updateMyPhotoAction : uploadDocumentAction.bind(null, tenantId, "photo")} submit={photo ? "Change photo" : "Upload photo"} className="mt-3">
          <FileInput name="file" accept="image/jpeg,image/png,image/webp" required label="Profile photo" />
        </ActionForm>
      )}

      <h3 className="mb-2 mt-6 text-sm font-medium">ID documents</h3>
      {ids.length === 0 ? <p className="text-sm text-muted">No ID document attached.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {ids.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <FileText className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ID_TYPES[(d.idType as keyof typeof ID_TYPES) ?? "other"] ?? "ID"}</p>
                <p className="truncate text-xs text-muted">{d.fileName} · {kb(d.sizeBytes)}</p>
              </div>
              <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener" title="View" aria-label="View" className={iconButtonClass()}><Eye className="size-4" aria-hidden /></a>
              <a href={`/api/documents/${d.id}?download=1`} title="Download" aria-label="Download" className={iconButtonClass()}><Download className="size-4" aria-hidden /></a>
              {!readOnly && <ConfirmButton label="Delete" title="Delete this ID document?" action={deleteDocumentAction.bind(null, d.id)} confirmLabel="Delete" />}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <ActionForm action={uploadDocumentAction.bind(null, tenantId, "id_proof")} submit="Add ID document" className="mt-3 space-y-3">
          <Field label="Document type">
            <Select name="idType" defaultValue="aadhaar">{Object.entries(ID_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <FileInput name="file" accept="image/jpeg,image/png,image/webp,application/pdf" required label="ID document file" />
        </ActionForm>
      )}
      <p className="mt-3 text-xs text-muted">JPG, PNG, WebP or PDF up to 1.5 MB. Files are private — only you and this tenant can open them.</p>
    </Card>
  );
}
