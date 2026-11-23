import type { Metadata } from "next";
import Link from "next/link";
import { BarkingDog } from "@/components/barking-dog";
import { Brand } from "@/components/logo";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

/** Friendly 404: a little dog that "couldn't sniff out" the page. Pure SVG + CSS, no JavaScript. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md text-center">
        <Brand className="mb-4 justify-center text-base" markClassName="size-8" />
        <BarkingDog>
        <div className="dog relative mx-auto w-72 max-w-full" role="img" aria-label="Rocky, a friendly dog wagging his tail and barking, looking for the missing page">
          <svg viewBox="0 0 300 230" className="w-full" aria-hidden="true">
            {/* ground + paw prints that fade in one after another */}
            <ellipse className="dog-shadow" cx="150" cy="205" rx="82" ry="9" fill="#0f172a" opacity="0.12" />
            <g fill="#94a3b8">
              {[28, 62, 96].map((x, i) => (
                <g key={x} className="dog-paw" transform={`translate(${x} ${208 - i * 2})`}>
                  <ellipse cx="0" cy="0" rx="5" ry="4" />
                  <circle cx="-5" cy="-6" r="2" /><circle cx="0" cy="-8" r="2" /><circle cx="5" cy="-6" r="2" />
                </g>
              ))}
            </g>

            {/* tail (wags) */}
            <path className="dog-tail" d="M205 165 C238 150 248 118 232 98 C228 108 226 126 202 140 Z" fill="#d99a52" />

            {/* body */}
            <ellipse cx="150" cy="160" rx="62" ry="42" fill="#e8b36f" />
            <ellipse cx="150" cy="172" rx="34" ry="28" fill="#f6dcb4" />
            {/* legs */}
            <rect x="106" y="178" width="22" height="30" rx="11" fill="#e8b36f" />
            <rect x="172" y="178" width="22" height="30" rx="11" fill="#e8b36f" />
            <ellipse cx="117" cy="207" rx="14" ry="6" fill="#f6dcb4" />
            <ellipse cx="183" cy="207" rx="14" ry="6" fill="#f6dcb4" />

            {/* collar + tag */}
            <path d="M118 124 Q150 142 182 124 L180 134 Q150 152 120 134 Z" fill="#0f766e" />
            <circle cx="150" cy="146" r="6" fill="#facc15" /><circle cx="150" cy="146" r="2.2" fill="#ca8a04" />

            {/* head (tilts) */}
            <g className="dog-head">
              <path className="dog-ear-l" d="M104 70 C82 62 70 88 78 112 C96 112 108 98 110 78 Z" fill="#a8683a" />
              <path className="dog-ear-r" d="M196 70 C218 62 230 88 222 112 C204 112 192 98 190 78 Z" fill="#a8683a" />
              <circle cx="150" cy="84" r="46" fill="#e8b36f" />
              <ellipse cx="150" cy="104" rx="26" ry="20" fill="#f6dcb4" />
              {/* eyes */}
              <g fill="#0f172a">
                <ellipse className="dog-eye" cx="132" cy="80" rx="5.5" ry="7" />
                <ellipse className="dog-eye" cx="168" cy="80" rx="5.5" ry="7" />
              </g>
              <circle cx="134" cy="77" r="1.8" fill="#fff" /><circle cx="170" cy="77" r="1.8" fill="#fff" />
              {/* brows (a puzzled look) */}
              <path d="M124 66 Q132 60 140 66" stroke="#a8683a" strokeWidth="3" fill="none" strokeLinecap="round" />
              <path d="M160 64 Q168 56 176 62" stroke="#a8683a" strokeWidth="3" fill="none" strokeLinecap="round" />
              {/* nose + mouth + tongue */}
              <ellipse cx="150" cy="96" rx="9" ry="6.5" fill="#1e293b" />
              <ellipse cx="147.5" cy="94" rx="2.6" ry="1.6" fill="#64748b" />
              <path d="M150 102 L150 108 M150 108 Q141 116 134 110 M150 108 Q159 116 166 110" stroke="#1e293b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <ellipse className="dog-mouth" cx="150" cy="111" rx="14" ry="11" fill="#7f1d1d" />
              <path className="dog-tongue" d="M144 112 Q150 132 156 112 Z" fill="#f472b6" />
            </g>

            {/* WOOF! pops up when Rocky barks */}
            <g className="dog-woof" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#0f766e">
              <text x="40" y="52" fontSize="22" transform="rotate(-14 40 52)">WOOF!</text>
              <text x="52" y="84" fontSize="15" transform="rotate(-6 52 84)">woof!</text>
            </g>

            {/* "?" bubble */}
            <g className="dog-bubble">
              <circle cx="240" cy="48" r="20" fill="#ccfbf1" stroke="#0f766e" strokeWidth="2.5" />
              <path d="M231 44 Q231 34 240 34 Q249 34 249 42 Q249 47 243 50 Q240 52 240 56" stroke="#0f766e" strokeWidth="3.4" fill="none" strokeLinecap="round" />
              <circle cx="240" cy="63" r="2.4" fill="#0f766e" />
              <path d="M222 62 L214 74 L230 68 Z" fill="#ccfbf1" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />
            </g>
          </svg>
        </div>
        </BarkingDog>

        <p className="mt-2 text-6xl font-semibold tracking-tight text-accent sm:text-7xl" aria-hidden="true">404</p>
        <h1 className="mt-1 text-xl font-semibold">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Rocky sniffed everywhere but couldn&apos;t find this page. It may have moved, or the link might be wrong.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClass()}>Take me home</Link>
          <Link href="/?login=1" className={buttonClass("secondary")}>Login</Link>
        </div>
      </div>
    </main>
  );
}
