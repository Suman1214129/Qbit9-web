import { cn } from "@/lib/cn";

interface Props {
  branchLabel: string;
  /** Distance of the customer from the branch, in metres. Omit to show only the branch. */
  distanceM?: number | null;
  radiusM: number;
  className?: string;
}

/** Stylised street map with the join radius as a dashed ring. Not geographic: it shows how near you are. */
export function BranchMap({ branchLabel, distanceM, radiusM, className }: Props) {
  const R = 66;
  const cx = 160, cy = 100;
  const px = distanceM == null ? null : Math.min(150, (distanceM / radiusM) * R);
  const you = px == null ? null : { x: cx + Math.cos(0.7) * px, y: cy + Math.sin(0.7) * px };
  const clampedY = you ? Math.min(176, Math.max(24, you.y)) : 0;
  const clampedX = you ? Math.min(296, Math.max(20, you.x)) : 0;
  const labelW = Math.max(70, branchLabel.length * 6 + 24);
  return (
    <svg viewBox="0 0 316 196" preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Map: ${branchLabel}${distanceM != null ? `, you are about ${Math.round(distanceM)} metres away` : ""}`} className={cn("block h-full w-full", className)}>
      <rect width="316" height="196" fill="#F7EAE5" />
      <g stroke="#fff" strokeWidth="12" strokeLinecap="round" fill="none">
        <path d="M-10 128 L330 100" /><path d="M104 -10 L126 206" /><path d="M236 -10 L220 206" />
      </g>
      <g fill="#EFD6D3">
        <rect x="14" y="20" width="76" height="64" rx="10" /><rect x="138" y="14" width="84" height="58" rx="10" /><rect x="250" y="22" width="56" height="62" rx="10" />
        <rect x="14" y="142" width="80" height="44" rx="10" /><rect x="142" y="146" width="70" height="40" rx="10" /><rect x="246" y="140" width="62" height="48" rx="10" />
      </g>
      <rect x="14" y="142" width="40" height="44" rx="10" fill="#DDE9CF" />
      <circle cx={cx} cy={cy} r={R} fill="rgba(173,74,99,.09)" stroke="#AD4A63" strokeWidth="1.6" strokeDasharray="4 5" />
      <circle cx={cx} cy={cy} r="15" fill="#AD4A63" />
      <path d="M153 107h14M155 107v-6M159 107v-6M161 107v-6M165 107v-6M160 94l-8 4h16z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -1)" />
      <rect x={cx - labelW / 2} y="64" width={labelW} height="20" rx="10" fill="#5A2234" />
      <text x={cx} y="78" textAnchor="middle" fontFamily="var(--font-grotesk), system-ui" fontSize="10" fontWeight="600" fill="#FFF3EF">{branchLabel}</text>
      {you ? (
        <>
          <circle cx={clampedX} cy={clampedY} r="18" fill="rgba(90,34,52,.14)" />
          <circle cx={clampedX} cy={clampedY} r="7" fill="#5A2234" stroke="#fff" strokeWidth="2.5" />
          <rect x={clampedX - 22} y={Math.min(168, clampedY + 16)} width="44" height="20" rx="10" fill="#5A2234" />
          <text x={clampedX} y={Math.min(168, clampedY + 16) + 14} textAnchor="middle" fontFamily="var(--font-grotesk), system-ui" fontSize="10" fontWeight="600" fill="#FFF3EF">You</text>
        </>
      ) : null}
    </svg>
  );
}
