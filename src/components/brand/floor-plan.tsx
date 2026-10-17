import { cn } from "@/lib/cn";

interface Props {
  /** Counter numbers on the floor, left to right. */
  counters: number[];
  /** Counter the customer will be sent to. */
  highlight?: number | null;
  /** Draw the dotted path from the seating area to the highlighted counter. */
  path?: boolean;
  /** Compact strip used inside the "called" screen. */
  compact?: boolean;
  className?: string;
}

/** Schematic branch floor: counters on top, seating below. Shows where to sit and where to go. */
export function FloorPlan({ counters, highlight, path, compact, className }: Props) {
  const BOX = 44, GAP = 10;
  const n = Math.max(1, Math.min(counters.length, 6));
  const shown = counters.slice(0, n);
  const total = n * BOX + (n - 1) * GAP;
  const x0 = (316 - total) / 2;
  const top = compact ? 10 : 24;
  const h = compact ? 26 : 30;
  const hi = shown.findIndex((c) => c === highlight);
  const target = hi >= 0 ? { x: x0 + hi * (BOX + GAP) + BOX / 2, y: top + h } : null;
  const you = compact ? { x: 52, y: 76 } : { x: 116, y: 118 };
  const vb = compact ? "0 0 316 100" : "0 0 316 172";
  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid slice" role="img" aria-label={highlight ? `Branch floor: counter ${highlight} is where you will be called` : "Branch floor plan"} className={cn("block h-full w-full", className)}>
      <rect width="316" height={compact ? 100 : 172} fill={compact ? "#FDF9F6" : "#F1D3D7"} />
      {!compact ? <rect x="12" y="12" width="292" height="148" rx="16" fill="#FFF7F3" /> : null}
      <g fontFamily="var(--font-grotesk), system-ui" fontSize="10" fontWeight="600" fill="#5A2234" textAnchor="middle">
        {shown.map((c, i) => {
          const on = c === highlight;
          const x = x0 + i * (BOX + GAP);
          return (
            <g key={c}>
              <rect x={x} y={top} width={BOX} height={h} rx="9" fill={on ? "#AD4A63" : "#E2C37F"} />
              <text x={x + BOX / 2} y={top + h / 2 + 4} fill={on ? "#fff" : "#5A2234"}>{c}</text>
            </g>
          );
        })}
      </g>
      {!compact ? (
        <>
          <g fill="#E3DFFF">
            {[28, 56, 84].map((x) => <rect key={x} x={x} y="104" width="22" height="22" rx="7" />)}
            {[28, 56].map((x) => <rect key={x} x={x} y="132" width="22" height="22" rx="7" />)}
          </g>
          <rect x="250" y="156" width="40" height="8" rx="4" fill="#FFF7F3" />
          <text x="270" y="140" fontFamily="var(--font-grotesk), system-ui" fontSize="9" fill="#7A6A70" textAnchor="middle">Entrance</text>
        </>
      ) : null}
      {path && target ? (
        <path d={compact ? `M60 ${you.y} C90 ${you.y} 120 64 160 60 S${target.x - 10} 58 ${target.x} ${target.y + 10}` : `M${you.x} ${you.y - 10} C${you.x} 90 ${target.x} 80 ${target.x} ${target.y + 12}`} fill="none" stroke="#AD4A63" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
      ) : null}
      <circle cx={you.x} cy={you.y} r={compact ? 9 : 11} fill="#9A4059" />
      <circle cx={you.x} cy={you.y} r={compact ? 3.5 : 4} fill="#fff" />
      {!compact ? (
        <>
          <rect x={you.x - 16} y={you.y - 32} width="32" height="15" rx="7.5" fill="#5A2234" />
          <text x={you.x} y={you.y - 21} fontFamily="var(--font-grotesk), system-ui" fontSize="9" fontWeight="600" fill="#FFF3EF" textAnchor="middle">You</text>
        </>
      ) : null}
    </svg>
  );
}
