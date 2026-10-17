import { useId } from "react";
import { cn } from "@/lib/cn";

/** Rust ink stamp for a finished visit. The circular text follows the badge ring. */
export function StampBadge({ label = "QUEUE-FREE VISIT · MAIN ROAD ·", size = 124, className }: { label?: string; size?: number; className?: string }) {
  const id = `stamp-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 80 80" width={size} height={size} aria-hidden="true" className={cn("opacity-90 mix-blend-multiply", className)}>
      <circle cx="40" cy="40" r="37" fill="none" stroke="#8A3347" strokeWidth="1.4" />
      <circle cx="40" cy="40" r="22" fill="none" stroke="#8A3347" strokeWidth=".9" />
      <path id={id} d="M40 40m-29.5 0a29.5 29.5 0 1 1 59 0a29.5 29.5 0 1 1-59 0" fill="none" />
      <text fontSize="6.4" fontWeight="700" fill="#8A3347" fontFamily="var(--font-grotesk), system-ui">
        <textPath href={`#${id}`} textLength="181" lengthAdjust="spacing">{label}</textPath>
      </text>
      <path d="M29 40l7 7 14-14" fill="none" stroke="#8A3347" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
