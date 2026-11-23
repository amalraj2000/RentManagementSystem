import Link from "next/link";
import { SettingsTabs } from "@/components/settings-tabs";
import { ExternalLink } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/action-form";
import { FileInput } from "@/components/file-input";
import { Card, Empty, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { addSitePhotoAction, deleteSitePhotoAction, updateWebsiteAction } from "@/actions/admin";
import { getDb } from "@/db/client";
import { requireAdmin } from "@/lib/session";
import { getWebsiteInfo, listSitePhotos, MAX_SITE_PHOTOS } from "@/services/website";

export const metadata = { title: "Website" };

export default async function WebsiteAdmin() {
  await requireAdmin();
  const db = getDb();
  const [w, photos] = await Promise.all([getWebsiteInfo(db), listSitePhotos(db)]);
  return (
    <>
      <PageHeader title="Settings" description="Landing page — what visitors see before they log in." actions={<Link href="/" target="_blank" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 text-sm font-medium hover:bg-slate-50"><ExternalLink className="size-4" aria-hidden /> View website</Link>} />
      <SettingsTabs current="website" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Details &amp; contact</h2>
          <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">Everything here is <strong>public</strong> — anyone can see it without logging in.</p>
          <ActionForm action={updateWebsiteAction} reset={false} className="space-y-3">
            <Field label="PG name"><Input name="pgName" required minLength={2} maxLength={60} defaultValue={w.pgName} /></Field>
            <Field label="Tagline" hint="One line under the name, e.g. “Safe & homely stay for working women”."><Input name="tagline" maxLength={120} defaultValue={w.tagline} /></Field>
            <Field label="About"><Textarea name="about" rows={4} maxLength={1000} defaultValue={w.about} /></Field>
            <Field label="Address"><Textarea name="address" rows={2} maxLength={300} defaultValue={w.address} /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Call number"><Input name="contactPhone" type="tel" maxLength={20} defaultValue={w.contactPhone} /></Field>
              <Field label="WhatsApp number"><Input name="whatsapp" type="tel" maxLength={20} defaultValue={w.whatsapp} /></Field>
            </div>
            <Field label="Email"><Input name="contactEmail" type="email" maxLength={200} defaultValue={w.contactEmail} /></Field>
            <Field label="Google Maps link" hint="Open your location in Google Maps → Share → copy link."><Input name="mapsLink" maxLength={500} placeholder="https://maps.app.goo.gl/…" defaultValue={w.mapsLink} /></Field>
          </ActionForm>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Photos ({photos.length}/{MAX_SITE_PHOTOS})</h2>
          <p className="mb-3 text-xs text-muted">Rooms, kitchen, hall, sit-out. JPG, PNG or WebP up to 1.5 MB (big photos are shrunk automatically).</p>
          {photos.length === 0 ? <Empty>No photos yet. Add your first one below.</Empty> : (
            <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((p) => (
                <li key={p.id} className="overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element -- served from our own DB route; not using Next image optimisation */}
                  <img src={`/api/site-photos/${p.id}`} alt={p.caption || "PG photo"} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                  <div className="flex items-center justify-between gap-1 p-2">
                    <span className="truncate text-xs text-muted">{p.caption || "No caption"}</span>
                    <ConfirmButton label="Delete" title="Remove this photo from the website?" action={deleteSitePhotoAction.bind(null, p.id)} confirmLabel="Remove" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addSitePhotoAction} submit="Add photo" className="space-y-3 border-t border-line pt-4">
            <Field label="Caption (optional)"><Input name="caption" maxLength={120} placeholder="e.g. Bedroom 1" /></Field>
            <FileInput name="file" accept="image/jpeg,image/png,image/webp" required label="Photo" />
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
