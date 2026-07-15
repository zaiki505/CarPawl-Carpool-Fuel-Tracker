import React from "react";

/* Little schematic illustrations for the concept cards: avatars, a car glyph, chips 
   and arrows. */

const ACC = "var(--highlight)";
const MUT = "var(--text-faint)";
const TXT = "var(--text-body)";
const POS = "var(--available)";
const NEG = "var(--unavailable)";
const LINE = "var(--border-hairline)";

const FONT = "var(--font-mono)";

// --- shared primitives ----------------------------------------------------

function Avatar({ cx, cy, r = 13, color = ACC }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} style={{ fill: "none", stroke: color, strokeWidth: 2 }} />
      <circle cx={cx} cy={cy - r * 0.25} r={r * 0.34} style={{ fill: color }} />
      <path
        d={`M ${cx - r * 0.6} ${cy + r * 0.62} a ${r * 0.6} ${r * 0.55} 0 0 1 ${r * 1.2} 0`}
        style={{ fill: color }}
      />
    </g>
  );
}

function CarGlyph({ cx, cy, w = 48, color = ACC }) {
  const h = w * 0.34;
  return (
    <g>
      <rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        rx={h * 0.45}
        style={{ fill: "none", stroke: color, strokeWidth: 2 }}
      />
      <rect
        x={cx - w * 0.22}
        y={cy - h * 0.78}
        width={w * 0.44}
        height={h * 0.6}
        rx={4}
        style={{ fill: "none", stroke: color, strokeWidth: 2 }}
      />
      <circle cx={cx - w * 0.28} cy={cy + h / 2} r={h * 0.3} style={{ fill: color }} />
      <circle cx={cx + w * 0.28} cy={cy + h / 2} r={h * 0.3} style={{ fill: color }} />
    </g>
  );
}

function Arrow({ x1, y, x2, color = MUT }) {
  const dir = x2 > x1 ? 1 : -1;
  return (
    <g style={{ stroke: color, strokeWidth: 2, strokeLinecap: "round" }}>
      <line x1={x1} y1={y} x2={x2 - dir * 6} y2={y} />
      <path
        d={`M ${x2} ${y} L ${x2 - dir * 8} ${y - 5} M ${x2} ${y} L ${x2 - dir * 8} ${y + 5}`}
        style={{ fill: "none" }}
      />
    </g>
  );
}

function Chip({ x, y, w = 96, label, color = ACC }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={22} rx={7} style={{ fill: "none", stroke: color, strokeWidth: 1.6 }} />
      <circle cx={x + 13} cy={y + 11} r={4} style={{ fill: color }} />
      <text x={x + 24} y={y + 15} style={{ fill: TXT, fontSize: 10, fontWeight: 700, fontFamily: FONT }}>
        {label}
      </text>
    </g>
  );
}

function Cap({ x, y, children, color = MUT, size = 9.5, anchor = "middle" }) {
  return (
    <text x={x} y={y} textAnchor={anchor} style={{ fill: color, fontSize: size, fontWeight: 700, fontFamily: FONT }}>
      {children}
    </text>
  );
}

// A little 4-point sparkle, like the neon mockups.
function Sparkle({ cx, cy, r = 3.5, color = ACC }) {
  return (
    <path
      d={`M ${cx} ${cy - r} C ${cx + r * 0.15} ${cy - r * 0.15}, ${cx + r * 0.15} ${cy - r * 0.15}, ${cx + r} ${cy} C ${cx + r * 0.15} ${cy + r * 0.15}, ${cx + r * 0.15} ${cy + r * 0.15}, ${cx} ${cy + r} C ${cx - r * 0.15} ${cy + r * 0.15}, ${cx - r * 0.15} ${cy + r * 0.15}, ${cx - r} ${cy} C ${cx - r * 0.15} ${cy - r * 0.15}, ${cx - r * 0.15} ${cy - r * 0.15}, ${cx} ${cy - r} Z`}
      style={{ fill: color, opacity: 0.75 }}
    />
  );
}

/* Every illustration sits in this frame: a self-coloured neon GLOW filter (each
   stroke/fill blooms in its own colour) plus a few sparkle accents, to match the
   glowing mockup style (#0). Duplicate filter ids across the 11 SVGs are fine -
   each is identical, so every `url(#cglow)` resolves to the same effect. */
function Frame({ children, sparkles = true }) {
  return (
    <svg viewBox="0 0 240 118" className="concept-art" role="img" aria-hidden="true">
      <defs>
        <filter id="cglow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="1.1" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {sparkles && (
        <g style={{ opacity: 0.7 }}>
          <Sparkle cx={16} cy={20} r={3} color={MUT} />
          <Sparkle cx={226} cy={26} r={4} color={ACC} />
          <Sparkle cx={222} cy={98} r={2.6} color={MUT} />
        </g>
      )}
      <g filter="url(#cglow)">{children}</g>
    </svg>
  );
}

const Pin = ({ cx, cy, color = ACC }) => (
  <g>
    <path
      d={`M ${cx} ${cy} C ${cx - 8} ${cy - 10} ${cx - 6} ${cy - 22} ${cx} ${cy - 22} C ${cx + 6} ${cy - 22} ${cx + 8} ${cy - 10} ${cx} ${cy} Z`}
      style={{ fill: color }}
    />
    <circle cx={cx} cy={cy - 15} r={3.2} style={{ fill: "var(--surface-chip)" }} />
  </g>
);

// --- per-concept illustrations --------------------------------------------

export const CONCEPT_ART = {
  ownVsCarpool: () => (
    <Frame>
      <CarGlyph cx={45} cy={30} w={48} color={ACC} />
      <Arrow x1={78} y={30} x2={150} color={POS} />
      <Avatar cx={182} cy={30} color={POS} />
      <Cap x={120} y={12} color={POS}>Others pay you</Cap>
      <line x1={20} y1={59} x2={220} y2={59} style={{ stroke: LINE, strokeWidth: 1 }} />
      <Avatar cx={58} cy={90} color={MUT} />
      <Arrow x1={150} y={90} x2={90} color={NEG} />
      <CarGlyph cx={185} cy={90} w={48} color={MUT} />
      <Cap x={120} y={112} color={NEG}>You pay the owner</Cap>
    </Frame>
  ),

  distanceSplit: () => (
    <Frame>
      {/* Route drawn so each pin's tip sits exactly on the line (T reflects the
          previous control point, so it passes through the pin bases). */}
      <path
        d="M 24 84 Q 54 74 86 66 T 148 54 T 208 46"
        style={{ fill: "none", stroke: LINE, strokeWidth: 2, strokeDasharray: "3 5" }}
      />
      <CarGlyph cx={30} cy={86} w={36} color={ACC} />
      <Pin cx={86} cy={66} color={ACC} />
      <Pin cx={148} cy={54} color={ACC} />
      <Pin cx={208} cy={46} color={ACC} />
      <Cap x={86} y={82}>15 km</Cap>
      <Cap x={148} y={70}>35 km</Cap>
      <Cap x={208} y={62}>25 km</Cap>
      <Cap x={120} y={113} color={ACC}>Pay for what you rode</Cap>
    </Frame>
  ),

  equalSplit: () => (
    <Frame>
      <Avatar cx={52} cy={40} color={ACC} />
      <Avatar cx={120} cy={40} color={ACC} />
      <Avatar cx={188} cy={40} color={ACC} />
      <line x1={52} y1={62} x2={188} y2={62} style={{ stroke: LINE, strokeWidth: 1.5 }} />
      <line x1={52} y1={62} x2={52} y2={70} style={{ stroke: LINE, strokeWidth: 1.5 }} />
      <line x1={120} y1={62} x2={120} y2={70} style={{ stroke: LINE, strokeWidth: 1.5 }} />
      <line x1={188} y1={62} x2={188} y2={70} style={{ stroke: LINE, strokeWidth: 1.5 }} />
      <rect x={78} y={80} width={84} height={26} rx={8} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <text x={120} y={97} textAnchor="middle" style={{ fill: ACC, fontSize: 13, fontWeight: 800, fontFamily: FONT }}>
        RM20 each
      </text>
    </Frame>
  ),

  customSplit: () => (
    <Frame>
      <Chip x={16} y={8} label="Fuel" color={ACC} />
      <Chip x={16} y={34} label="Tolls" color={ACC} />
      <Chip x={16} y={60} label="Parking" color={ACC} />
      <Chip x={16} y={86} label="Maint. 10%" color={ACC} />
      <Arrow x1={120} y={58} x2={158} color={MUT} />
      <rect x={162} y={40} width={62} height={36} rx={9} style={{ fill: "none", stroke: POS, strokeWidth: 2 }} />
      <Cap x={193} y={56} color={POS} size={8.5}>TOTAL</Cap>
      <text x={193} y={70} textAnchor="middle" style={{ fill: POS, fontSize: 12, fontWeight: 800, fontFamily: FONT }}>
        RM
      </text>
    </Frame>
  ),

  maintenanceMarkup: () => (
    <Frame>
      {/* a centered gauge sweeping up, with a "+10%" badge above it */}
      <path
        d="M 80 88 A 40 40 0 0 1 160 88"
        style={{ fill: "none", stroke: LINE, strokeWidth: 5, strokeLinecap: "round" }}
      />
      <path
        d="M 80 88 A 40 40 0 0 1 120 48"
        style={{ fill: "none", stroke: POS, strokeWidth: 5, strokeLinecap: "round" }}
      />
      <line x1={120} y1={88} x2={143} y2={60} style={{ stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }} />
      <circle cx={120} cy={88} r={5} style={{ fill: ACC }} />
      <rect x={95} y={14} width={50} height={22} rx={11} style={{ fill: "none", stroke: POS, strokeWidth: 2 }} />
      <text x={120} y={30} textAnchor="middle" style={{ fill: POS, fontSize: 12, fontWeight: 800, fontFamily: FONT }}>
        +10%
      </text>
      <Cap x={120} y={110}>Extra % on top of fuel</Cap>
    </Frame>
  ),

  credit: () => (
    <Frame>
      {/* a centered wallet with a green "+" coin (the overpayment) dropping in */}
      <rect x={80} y={44} width={80} height={52} rx={10} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <rect x={80} y={44} width={80} height={13} rx={10} style={{ fill: ACC, opacity: 0.18 }} />
      <rect x={132} y={62} width={24} height={17} rx={5} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <circle cx={143} cy={70} r={2.5} style={{ fill: ACC }} />
      <circle cx={120} cy={32} r={13} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <text x={120} y={38} textAnchor="middle" style={{ fill: POS, fontSize: 16, fontWeight: 800, fontFamily: FONT }}>
        +
      </text>
      <Cap x={120} y={113} color={POS}>Overpaid, held as credit</Cap>
    </Frame>
  ),

  creditOffset: () => (
    <Frame>
      <Cap x={54} y={20} color={POS}>Credit</Cap>
      <rect x={26} y={28} width={56} height={20} rx={6} style={{ fill: POS, opacity: 0.35 }} />
      <rect x={26} y={28} width={56} height={20} rx={6} style={{ fill: "none", stroke: POS, strokeWidth: 1.6 }} />
      <Arrow x1={90} y={62} x2={150} color={ACC} />
      <Cap x={186} y={20} color={NEG}>Debt</Cap>
      <rect x={158} y={28} width={56} height={20} rx={6} style={{ fill: "none", stroke: NEG, strokeWidth: 1.6 }} />
      <rect x={158} y={28} width={24} height={20} rx={6} style={{ fill: NEG, opacity: 0.3 }} />
      <Cap x={120} y={100} color={ACC}>Apply one to shrink</Cap>
      <Cap x={120} y={114}>the other - reversible</Cap>
    </Frame>
  ),

  // Remade (#6): a timeline reading left-to-right - "now" on a solid past line,
  // a dashed future stretch, and the pending trip (a fuel drop) waiting ahead.
  upcoming: () => (
    <Frame>
      <line x1={22} y1={60} x2={116} y2={60} style={{ stroke: MUT, strokeWidth: 2 }} />
      <line
        x1={116}
        y1={60}
        x2={218}
        y2={60}
        style={{ stroke: ACC, strokeWidth: 2, strokeDasharray: "4 5" }}
      />
      <circle cx={116} cy={60} r={6} style={{ fill: "var(--surface-chip)", stroke: ACC, strokeWidth: 2.5 }} />
      <Cap x={116} y={44} color={ACC}>now</Cap>
      <circle cx={192} cy={60} r={18} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <path
        d="M 192 50 C 200 59, 200 66, 192 71 C 184 66, 184 59, 192 50 Z"
        style={{ fill: "none", stroke: POS, strokeWidth: 2 }}
      />
      <Cap x={192} y={90} color={POS}>upcoming</Cap>
      <Cap x={120} y={113}>Counts once its date arrives</Cap>
    </Frame>
  ),

  prepay: () => (
    <Frame>
      {/* calendar (with binder tabs) centred on x=120, coin nested in its corner */}
      <line x1={96} y1={16} x2={96} y2={28} style={{ stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }} />
      <line x1={144} y1={16} x2={144} y2={28} style={{ stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }} />
      <rect x={74} y={24} width={92} height={66} rx={10} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <line x1={74} y1={42} x2={166} y2={42} style={{ stroke: ACC, strokeWidth: 2 }} />
      <circle cx={150} cy={82} r={14} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <text x={150} y={86} textAnchor="middle" style={{ fill: POS, fontSize: 11, fontWeight: 800, fontFamily: FONT }}>
        RM
      </text>
      <Cap x={120} y={112}>Pay early, held till the day</Cap>
    </Frame>
  ),

  recurring: () => (
    <Frame>
      <path
        d="M 156 56 A 36 36 0 1 1 148 32"
        style={{ fill: "none", stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }}
      />
      <path d="M 150 18 L 152 34 L 136 32 Z" style={{ fill: ACC }} />
      <rect x={98} y={40} width={44} height={30} rx={6} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <line x1={98} y1={50} x2={142} y2={50} style={{ stroke: MUT, strokeWidth: 2 }} />
      <Cap x={120} y={113}>Auto-schedules the next one</Cap>
    </Frame>
  ),

  // Remade (#6): your Drive cloud with a "synced" check badge, feeding a phone
  // and a laptop - one backup, every device up to date.
  driveSync: () => (
    <Frame>
      <path
        d="M 99 42 a 20 20 0 0 1 39 -6 a 16 16 0 0 1 3 32 h -40 a 17 17 0 0 1 -2 -26 Z"
        style={{ fill: ACC, opacity: 0.12 }}
      />
      <path
        d="M 99 42 a 20 20 0 0 1 39 -6 a 16 16 0 0 1 3 32 h -40 a 17 17 0 0 1 -2 -26 Z"
        style={{ fill: "none", stroke: ACC, strokeWidth: 2, strokeLinejoin: "round" }}
      />
      <circle cx={142} cy={32} r={11} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <path
        d="M 137 32 l 3.5 4 l 6 -8"
        style={{ fill: "none", stroke: POS, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}
      />
      {/* phone (left) - raised a little so there's a clear gap above the caption */}
      <rect x={34} y={72} width={26} height={24} rx={4} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <line x1={34} y1={90} x2={60} y2={90} style={{ stroke: MUT, strokeWidth: 2 }} />
      {/* laptop (right) */}
      <rect x={182} y={74} width={30} height={20} rx={3} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <line x1={178} y1={98} x2={216} y2={98} style={{ stroke: MUT, strokeWidth: 2, strokeLinecap: "round" }} />
      <Arrow x1={92} y={78} x2={64} color={POS} />
      <Arrow x1={148} y={78} x2={178} color={POS} />
      <Cap x={120} y={115}>Synced across your devices</Cap>
    </Frame>
  ),
};
