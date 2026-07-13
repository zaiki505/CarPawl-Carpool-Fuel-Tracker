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

function Frame({ children }) {
  return (
    <svg viewBox="0 0 240 118" className="concept-art" role="img" aria-hidden="true">
      {children}
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
      <path
        d="M 24 78 C 70 40, 120 100, 170 58 S 220 40, 224 46"
        style={{ fill: "none", stroke: LINE, strokeWidth: 2, strokeDasharray: "3 5" }}
      />
      <CarGlyph cx={30} cy={82} w={38} color={ACC} />
      <Pin cx={92} cy={70} color={ACC} />
      <Pin cx={158} cy={58} color={ACC} />
      <Pin cx={214} cy={48} color={ACC} />
      <Cap x={92} y={92}>15 km</Cap>
      <Cap x={158} y={92}>35 km</Cap>
      <Cap x={214} y={92}>25 km</Cap>
      <Cap x={120} y={112} color={ACC}>Pay for what you rode</Cap>
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
      <Chip x={16} y={12} label="Fuel" color={ACC} />
      <Chip x={16} y={40} label="Tolls" color={ACC} />
      <Chip x={16} y={68} label="Parking" color={ACC} />
      <Chip x={16} y={96} label="Maint. 10%" color={ACC} />
      <Arrow x1={120} y={62} x2={158} color={MUT} />
      <rect x={162} y={44} width={62} height={36} rx={9} style={{ fill: "none", stroke: POS, strokeWidth: 2 }} />
      <Cap x={193} y={60} color={POS} size={8.5}>TOTAL</Cap>
      <text x={193} y={74} textAnchor="middle" style={{ fill: POS, fontSize: 12, fontWeight: 800, fontFamily: FONT }}>
        RM
      </text>
    </Frame>
  ),

  maintenanceMarkup: () => (
    <Frame>
      <rect x={40} y={70} width={70} height={26} rx={7} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <Cap x={75} y={87} color={ACC}>Fuel</Cap>
      <rect x={40} y={44} width={70} height={22} rx={7} style={{ fill: "none", stroke: POS, strokeWidth: 2 }} />
      <Cap x={75} y={59} color={POS}>+10%</Cap>
      <Arrow x1={120} y={64} x2={158} color={MUT} />
      <path
        d="M 165 92 A 36 36 0 0 1 223 92"
        style={{ fill: "none", stroke: LINE, strokeWidth: 3, strokeLinecap: "round" }}
      />
      <path
        d="M 165 92 A 36 36 0 0 1 200 57"
        style={{ fill: "none", stroke: POS, strokeWidth: 3, strokeLinecap: "round" }}
      />
      <line x1={194} y1={92} x2={206} y2={66} style={{ stroke: ACC, strokeWidth: 2.5, strokeLinecap: "round" }} />
      <Cap x={194} y={112} color={POS}>Recover wear</Cap>
    </Frame>
  ),

  credit: () => (
    <Frame>
      <rect x={64} y={44} width={112} height={54} rx={12} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <rect x={64} y={58} width={112} height={12} style={{ fill: ACC, opacity: 0.25 }} />
      <circle cx={150} cy={80} r={9} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <text x={150} y={84} textAnchor="middle" style={{ fill: ACC, fontSize: 11, fontWeight: 800, fontFamily: FONT }}>
        +
      </text>
      <Cap x={120} y={30} color={POS}>Overpaid = credit</Cap>
      <Cap x={120} y={114}>Held until you use it</Cap>
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

  upcoming: () => (
    <Frame>
      <rect x={70} y={26} width={100} height={72} rx={10} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <line x1={70} y1={44} x2={170} y2={44} style={{ stroke: ACC, strokeWidth: 2 }} />
      <line x1={92} y1={20} x2={92} y2={34} style={{ stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }} />
      <line x1={148} y1={20} x2={148} y2={34} style={{ stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }} />
      <circle cx={140} cy={72} r={13} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <path d="M 140 65 L 140 72 L 146 76" style={{ fill: "none", stroke: POS, strokeWidth: 2, strokeLinecap: "round" }} />
      <circle cx={95} cy={66} r={4} style={{ fill: MUT }} />
      <circle cx={112} cy={66} r={4} style={{ fill: MUT }} />
      <Cap x={120} y={114}>Counts once its date arrives</Cap>
    </Frame>
  ),

  prepay: () => (
    <Frame>
      <rect x={64} y={22} width={92} height={68} rx={10} style={{ fill: "none", stroke: ACC, strokeWidth: 2 }} />
      <line x1={64} y1={40} x2={156} y2={40} style={{ stroke: ACC, strokeWidth: 2 }} />
      <circle cx={150} cy={78} r={16} style={{ fill: "var(--surface-chip)", stroke: POS, strokeWidth: 2 }} />
      <text x={150} y={83} textAnchor="middle" style={{ fill: POS, fontSize: 12, fontWeight: 800, fontFamily: FONT }}>
        RM
      </text>
      <Cap x={100} y={112}>Pay early, held till the day</Cap>
    </Frame>
  ),

  recurring: () => (
    <Frame>
      <path
        d="M 156 58 A 36 36 0 1 1 148 34"
        style={{ fill: "none", stroke: ACC, strokeWidth: 3, strokeLinecap: "round" }}
      />
      <path d="M 150 20 L 152 36 L 136 34 Z" style={{ fill: ACC }} />
      <rect x={98} y={44} width={44} height={30} rx={6} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <line x1={98} y1={54} x2={142} y2={54} style={{ stroke: MUT, strokeWidth: 2 }} />
      <Cap x={120} y={112}>Auto-schedules the next one</Cap>
    </Frame>
  ),

  driveSync: () => (
    <Frame>
      <path
        d="M 92 58 a 20 20 0 0 1 39 -6 a 16 16 0 0 1 3 32 h -40 a 17 17 0 0 1 -2 -26 Z"
        style={{ fill: "none", stroke: ACC, strokeWidth: 2, strokeLinejoin: "round" }}
      />
      <rect x={24} y={70} width={34} height={24} rx={4} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <rect x={182} y={70} width={34} height={24} rx={4} style={{ fill: "none", stroke: MUT, strokeWidth: 2 }} />
      <Arrow x1={62} y={82} x2={92} color={POS} />
      <Arrow x1={178} y={82} x2={148} color={POS} />
      <Cap x={120} y={114}>Synced across your devices</Cap>
    </Frame>
  ),
};
