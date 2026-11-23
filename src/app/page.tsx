import type { Metadata } from "next";
import { Suspense } from "react";
import { Armchair, Bath, BedDouble, ImageIcon, Mail, MapPin, MessageCircle, Phone, Sofa, Utensils } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { LoginModal, LoginTrigger } from "@/components/login-modal";
import { PoweredBy } from "@/components/powered-by";
import { getDb } from "@/db/client";
import { whatsappNumber } from "@/lib/share";
import { roomSummaries } from "@/services/rooms";
import { DEFAULT_WEBSITE, getWebsiteInfo, listSitePhotos } from "@/services/website";

// Public page: rebuilt at most every 5 minutes, and immediately when the owner saves changes under Admin → Website.
export const revalidate = 300;

async function load() {
  try {
    const db = getDb();
    const [info, photos, rooms] = await Promise.all([getWebsiteInfo(db), listSitePhotos(db), roomSummaries(db)]);
    return { info, photos, rooms };
  } catch {
    return { info: DEFAULT_WEBSITE, photos: [], rooms: [] }; // never break the home page if the database is unreachable
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const { info } = await load();
  return { title: info.pgName, description: info.tagline || `${info.pgName} — a safe, homely paying guest accommodation for women.`, robots: { index: true, follow: true } };
}

const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors";

export default async function Landing() {
  const { info, photos, rooms } = await load();
  const beds = rooms.reduce((a, r) => a + r.beds, 0);
  const allBathrooms = rooms.length > 0 && rooms.every((r) => r.bathroom);
  const wa = whatsappNumber(info.whatsapp);
  const facilities = [
    ...(rooms.length ? [{ icon: BedDouble, title: `${rooms.length} bedroom${rooms.length > 1 ? "s" : ""}`, text: `${beds} beds in total${rooms.length ? ` — up to ${Math.max(...rooms.map((r) => r.beds))} sharing` : ""}` }] : []),
    ...(allBathrooms ? [{ icon: Bath, title: "Attached bathrooms", text: "Every bedroom has its own bathroom" }] : []),
    { icon: Utensils, title: "Shared kitchen", text: "A kitchen for all residents" },
    { icon: Sofa, title: "Shared hall", text: "A common space to relax" },
    { icon: Armchair, title: "Sit-out", text: "A shared open sit-out area" },
  ];
  const hasContact = info.contactPhone || wa || info.contactEmail || info.address || info.mapsLink;
  return (
    <div className="min-h-dvh bg-white">
      <Suspense fallback={null}><LoginModal /></Suspense>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5 text-base font-semibold tracking-tight"><LogoMark className="size-8" /><span className="truncate">{info.pgName}</span></span>
          <nav className="flex items-center gap-1 text-sm">
            <a href="#gallery" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 sm:inline">Photos</a>
            <a href="#contact" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 sm:inline">Contact</a>
            <LoginTrigger className={`${btn} min-h-9 bg-accent px-4 text-white hover:bg-accent-hover`}>Login</LoginTrigger>
          </nav>
        </div>
      </header>

      <section className="border-b border-line bg-gradient-to-b from-accent-soft/50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <p className="mb-3 inline-block rounded-full bg-white px-3 py-1 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">Ladies&apos; PG accommodation</p>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">{info.pgName}</h1>
          {info.tagline && <p className="mt-4 max-w-xl text-base text-slate-600 sm:text-lg">{info.tagline}</p>}
          <div className="mt-7 flex flex-wrap gap-3">
            <LoginTrigger className={`${btn} bg-accent text-white hover:bg-accent-hover`}>Login</LoginTrigger>
            {info.contactPhone && <a href={`tel:${info.contactPhone.replace(/\s/g, "")}`} className={`${btn} border border-line bg-white hover:bg-slate-50`}><Phone className="size-4" aria-hidden /> Call us</a>}
            {wa && <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hi, I'd like to know more about ${info.pgName}.`)}`} target="_blank" rel="noopener noreferrer" className={`${btn} border border-line bg-white hover:bg-slate-50`}><MessageCircle className="size-4 text-emerald-600" aria-hidden /> WhatsApp</a>}
          </div>
        </div>
      </section>

      <section id="gallery" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-xl font-semibold">Photos</h2>
        {photos.length === 0 ? (
          <div className="mt-4 grid place-items-center rounded-xl border border-dashed border-line bg-slate-50 py-14 text-center text-sm text-muted">
            <ImageIcon className="mb-2 size-8" aria-hidden />
            Photos coming soon.
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {photos.map((p, i) => (
              <li key={p.id} className="overflow-hidden rounded-xl border border-line bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element -- owner-uploaded images from our own route */}
                <img src={`/api/site-photos/${p.id}`} alt={p.caption || `${info.pgName} photo ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} decoding="async" width={800} height={600} className="aspect-[4/3] w-full object-cover" />
                {p.caption && <p className="px-3 py-2 text-xs text-slate-600">{p.caption}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-y border-line bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-xl font-semibold">Facilities</h2>
          {info.about && <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-700">{info.about}</p>}
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {facilities.map((f) => (
              <li key={f.title} className="flex items-start gap-3 rounded-xl border border-line bg-white p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><f.icon className="size-5" aria-hidden /></span>
                <div><p className="text-sm font-semibold">{f.title}</p><p className="text-xs text-muted">{f.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="text-xl font-semibold">Contact</h2>
        {hasContact ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ul className="space-y-3 text-sm">
              {info.address && <li className="flex items-start gap-3"><MapPin className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /><span className="whitespace-pre-line">{info.address}</span></li>}
              {info.contactPhone && <li className="flex items-center gap-3"><Phone className="size-4 shrink-0 text-accent" aria-hidden /><a className="hover:underline" href={`tel:${info.contactPhone.replace(/\s/g, "")}`}>{info.contactPhone}</a></li>}
              {wa && <li className="flex items-center gap-3"><MessageCircle className="size-4 shrink-0 text-accent" aria-hidden /><a className="hover:underline" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}`}>WhatsApp {info.whatsapp}</a></li>}
              {info.contactEmail && <li className="flex items-center gap-3"><Mail className="size-4 shrink-0 text-accent" aria-hidden /><a className="break-all hover:underline" href={`mailto:${info.contactEmail}`}>{info.contactEmail}</a></li>}
            </ul>
            {info.mapsLink && (
              <div className="flex items-start sm:justify-end">
                <a href={info.mapsLink} target="_blank" rel="noopener noreferrer" className={`${btn} border border-line bg-white hover:bg-slate-50`}><MapPin className="size-4 text-accent" aria-hidden /> View on Google Maps</a>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Contact details will be added soon.</p>
        )}
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted sm:px-6">
          <span className="flex items-center gap-2"><LogoMark className="size-5" />© {new Date().getFullYear()} {info.pgName}</span>
          <LoginTrigger className="font-medium text-accent hover:underline">Resident / owner login</LoginTrigger>
        </div>
        <div className="mx-auto max-w-6xl border-t border-line/60 px-4 py-4 text-center sm:px-6"><PoweredBy /></div>
      </footer>
    </div>
  );
}
