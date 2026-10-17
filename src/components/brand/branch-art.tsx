import { cn } from "@/lib/cn";

/** Illustration for the branch landing page: bank facade, tree, people and a token tag. Decorative. */
export function BranchArt({ tag = "C-047", className }: { tag?: string; className?: string }) {
  return (
    <svg viewBox="0 0 316 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className={cn("block h-full w-full", className)}>
      <rect width="316" height="150" fill="#F5CDD2" />
      <circle cx="44" cy="36" r="16" fill="#F6DDA0" />
      <path d="M0 112Q80 92 160 106T316 100V150H0Z" fill="#EDB5BE" />
      <rect y="124" width="316" height="26" fill="#E3A0AC" />
      <polygon points="86,50 158,20 230,50" fill="#FFEFE8" />
      <circle cx="158" cy="40" r="5" fill="#E2C37F" />
      <rect x="92" y="50" width="132" height="10" rx="3" fill="#F7DCD2" />
      <rect x="100" y="60" width="116" height="52" fill="#8A3347" />
      <rect x="151" y="82" width="14" height="30" rx="7" fill="#E2C37F" />
      <g fill="#FFF4EE">
        <rect x="102" y="60" width="14" height="52" rx="4" />
        <rect x="128" y="60" width="14" height="52" rx="4" />
        <rect x="174" y="60" width="14" height="52" rx="4" />
        <rect x="200" y="60" width="14" height="52" rx="4" />
      </g>
      <rect x="94" y="112" width="128" height="8" rx="3" fill="#F7DCD2" />
      <rect x="86" y="120" width="144" height="8" rx="3" fill="#FFEFE8" />
      <polygon points="30,126 44,96 58,126" fill="#9A8CE0" />
      <polygon points="33,106 44,80 55,106" fill="#B2A6EE" />
      <rect x="41" y="126" width="6" height="8" fill="#6F63B8" />
      <g style={{ color: "#E2C37F" }} fill="currentColor"><circle cx="268.5" cy="102" r="4" /><rect x="263" y="108" width="11" height="20" rx="5.5" /></g>
      <g style={{ color: "#CFE3E6" }} fill="currentColor"><circle cx="286.5" cy="105" r="3.6" /><rect x="281.5" y="110" width="10" height="17" rx="5" /></g>
      <g transform="translate(268 72) rotate(9)">
        <rect x="-32" y="-19" width="64" height="38" rx="8" fill="#AD4A63" />
        <circle cx="-32" cy="0" r="5" fill="#F5CDD2" />
        <circle cx="32" cy="0" r="5" fill="#F5CDD2" />
        <text x="0" y="5" textAnchor="middle" fontFamily="var(--font-grotesk), system-ui" fontSize="15" fontWeight="600" fill="#fff">{tag}</text>
      </g>
    </svg>
  );
}
