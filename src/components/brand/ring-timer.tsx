import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Circular countdown. `remaining` is 0..1 of the window left. */
export function RingTimer({ remaining, children, caption, size = 176, className }: { remaining: number; children: ReactNode; caption?: ReactNode; size?: number; className?: string }) {
  const C = 503;
  const r = Math.min(1, Math.max(0, remaining));
  return (
    <div className={cn("relative mx-auto", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 176 176" className="absolute inset-0 size-full" aria-hidden="true">
        <circle cx="88" cy="88" r="80" fill="none" stroke="rgba(90,34,52,.14)" strokeWidth="7" />
        <circle
          cx="88" cy="88" r="80" fill="none" stroke="#5A2234" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - r)} transform="rotate(-90 88 88)"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pb-1 font-semibold tracking-[-5px] text-deep" style={{ fontSize: size * 0.59 }}>
        {children}
      </div>
      {caption ? <span className="absolute inset-x-0 bottom-[22px] text-center text-xs text-deep/75">{caption}</span> : null}
    </div>
  );
}
