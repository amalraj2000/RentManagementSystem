/**
 * Landing-page picture: a two-floor house with a friendly dog in front. Pure SVG + CSS animation (no JavaScript, no image files):
 * smoke from the chimney, a drifting cloud, a turning sun, softly glowing windows, and a dog that wags his tail, blinks and pants.
 * The dog re-uses the `dog-*` animation classes from globals.css. Animations stop for visitors who prefer reduced motion.
 */
export function HouseScene({ name }: { name: string }) {
  return (
    <div className="house-scene mx-auto w-full max-w-xl" role="img" aria-label={`${name}: a two-floor house with a friendly dog wagging his tail in front`}>
      <svg viewBox="0 0 520 330" className="w-full" aria-hidden="true">
        {/* sky glow + sun + cloud */}
        <circle cx="70" cy="62" r="60" fill="#fef3c7" opacity="0.6" />
        <g transform="translate(70 62)">
          <g className="hs-sun">
            {Array.from({ length: 10 }, (_, i) => (
              <rect key={i} x="-2" y="-40" width="4" height="12" rx="2" fill="#f59e0b" transform={`rotate(${i * 36})`} />
            ))}
            <circle r="40" fill="none" />
          </g>
        </g>
        <circle cx="70" cy="62" r="20" fill="#fbbf24" />
        <g className="hs-cloud" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5">
          <ellipse cx="410" cy="56" rx="34" ry="14" />
          <ellipse cx="392" cy="48" rx="18" ry="12" />
          <ellipse cx="426" cy="46" rx="20" ry="13" />
        </g>

        {/* ground */}
        <rect x="0" y="298" width="520" height="32" fill="#bbf7d0" />
        <rect x="0" y="298" width="520" height="4" fill="#86efac" />
        <path d="M205 330 L228 298 L272 298 L295 330 Z" fill="#e7d5b3" />

        {/* chimney + smoke */}
        <rect x="318" y="46" width="28" height="56" fill="#b45309" />
        <rect x="314" y="42" width="36" height="8" rx="2" fill="#92400e" />
        <g fill="#cbd5e1">
          <circle className="hs-smoke hs-smoke-1" cx="332" cy="34" r="7" />
          <circle className="hs-smoke hs-smoke-2" cx="332" cy="34" r="6" />
          <circle className="hs-smoke hs-smoke-3" cx="332" cy="34" r="8" />
        </g>

        {/* roof */}
        <polygon points="112,102 250,38 388,102" fill="#0f766e" />
        <polygon points="112,102 250,38 388,102 372,102 250,50 128,102" fill="#115e59" />
        <circle cx="250" cy="76" r="11" fill="#fff" stroke="#115e59" strokeWidth="3" />
        <path d="M250 65 V87 M239 76 H261" stroke="#115e59" strokeWidth="2" />

        {/* upper floor */}
        <rect x="130" y="102" width="240" height="68" fill="#fde7c2" />
        {[150, 230, 310].map((x) => (
          <g key={x}>
            <rect x={x - 3} y="113" width="46" height="46" rx="3" fill="#92400e" />
            <rect className="hs-glow" x={x} y="116" width="40" height="40" rx="2" fill="#fde68a" />
            <path d={`M${x + 20} 116 V156 M${x} 136 H${x + 40}`} stroke="#92400e" strokeWidth="2.5" />
          </g>
        ))}
        {/* balcony rail */}
        <rect x="140" y="164" width="220" height="6" fill="#92400e" />

        {/* floor divider */}
        <rect x="104" y="170" width="292" height="9" rx="2" fill="#0f766e" />

        {/* ground floor */}
        <rect x="110" y="179" width="280" height="119" fill="#fcd9a0" />
        {[132, 318].map((x) => (
          <g key={x}>
            <rect x={x - 3} y="199" width="56" height="52" rx="3" fill="#92400e" />
            <rect className="hs-glow hs-glow-b" x={x} y="202" width="50" height="46" rx="2" fill="#fde68a" />
            <path d={`M${x + 25} 202 V248 M${x} 225 H${x + 50}`} stroke="#92400e" strokeWidth="2.5" />
            <rect x={x - 6} y="251" width="62" height="6" rx="2" fill="#0f766e" />
          </g>
        ))}
        {/* door */}
        <rect x="222" y="226" width="56" height="72" rx="4" fill="#0f766e" />
        <rect x="230" y="234" width="18" height="26" rx="2" fill="#115e59" /><rect x="252" y="234" width="18" height="26" rx="2" fill="#115e59" />
        <circle cx="268" cy="268" r="3" fill="#fbbf24" />
        <rect x="214" y="218" width="72" height="8" rx="2" fill="#115e59" />

        {/* bushes */}
        <g fill="#22c55e">
          <ellipse cx="112" cy="296" rx="24" ry="16" /><ellipse cx="136" cy="298" rx="18" ry="12" />
          <ellipse cx="300" cy="298" rx="14" ry="10" />
        </g>
        <g fill="#16a34a"><ellipse cx="104" cy="298" rx="14" ry="10" /><ellipse cx="146" cy="300" rx="10" ry="7" /></g>

        {/* the dog, in front of the house */}
        <g transform="translate(300 188) scale(0.52)">
          <ellipse className="dog-shadow" cx="150" cy="208" rx="86" ry="9" fill="#0f172a" opacity="0.14" />
          <path className="dog-tail" d="M205 165 C238 150 248 118 232 98 C228 108 226 126 202 140 Z" fill="#d99a52" />
          <ellipse cx="150" cy="160" rx="62" ry="42" fill="#e8b36f" />
          <ellipse cx="150" cy="172" rx="34" ry="28" fill="#f6dcb4" />
          <rect x="106" y="178" width="22" height="30" rx="11" fill="#e8b36f" />
          <rect x="172" y="178" width="22" height="30" rx="11" fill="#e8b36f" />
          <ellipse cx="117" cy="207" rx="14" ry="6" fill="#f6dcb4" />
          <ellipse cx="183" cy="207" rx="14" ry="6" fill="#f6dcb4" />
          <path d="M118 124 Q150 142 182 124 L180 134 Q150 152 120 134 Z" fill="#0f766e" />
          <circle cx="150" cy="146" r="6" fill="#facc15" />
          <g className="dog-head">
            <path className="dog-ear-l" d="M104 70 C82 62 70 88 78 112 C96 112 108 98 110 78 Z" fill="#a8683a" />
            <path className="dog-ear-r" d="M196 70 C218 62 230 88 222 112 C204 112 192 98 190 78 Z" fill="#a8683a" />
            <circle cx="150" cy="84" r="46" fill="#e8b36f" />
            <ellipse cx="150" cy="104" rx="26" ry="20" fill="#f6dcb4" />
            <g fill="#0f172a">
              <ellipse className="dog-eye" cx="132" cy="80" rx="5.5" ry="7" />
              <ellipse className="dog-eye" cx="168" cy="80" rx="5.5" ry="7" />
            </g>
            <circle cx="134" cy="77" r="1.8" fill="#fff" /><circle cx="170" cy="77" r="1.8" fill="#fff" />
            <ellipse cx="150" cy="96" rx="9" ry="6.5" fill="#1e293b" />
            <ellipse cx="147.5" cy="94" rx="2.6" ry="1.6" fill="#64748b" />
            <path d="M150 102 L150 108 M150 108 Q141 116 134 110 M150 108 Q159 116 166 110" stroke="#1e293b" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path className="dog-tongue" d="M144 112 Q150 132 156 112 Z" fill="#f472b6" />
          </g>
        </g>
      </svg>
    </div>
  );
}
