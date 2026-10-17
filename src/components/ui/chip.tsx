import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

export type ChipTone = "mustard" | "rose" | "pink" | "peach" | "lavender" | "off" | "ok";
const tones: Record<ChipTone, string> = {
  mustard: "bg-mustard",
  rose: "bg-rose",
  pink: "bg-pink",
  peach: "bg-peach",
  lavender: "bg-lavender",
  off: "border border-dashed border-ink/40 bg-transparent",
  ok: "bg-ok/15 text-ok",
};

export function Chip({ tone = "rose", icon, children, className }: { tone?: ChipTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-[7px] rounded-chip px-2.5 py-1.5 text-xs leading-none", tones[tone], className)}>
      {icon ? <Icon name={icon} size={12} strokeWidth={2.2} /> : null}
      {children}
    </span>
  );
}

/** Round count badge, e.g. next to a section heading. */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-strong px-[5px] text-[11px] font-semibold text-white", className)}>
      {children}
    </span>
  );
}
