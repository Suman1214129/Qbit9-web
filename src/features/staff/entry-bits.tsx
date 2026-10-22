import type { ReactNode } from "react";
import { Icon } from "@/components/ui";
import type { QueueEntry } from "@/domain";
import { cn } from "@/lib/cn";

/** Small pill used on queue rows: priority, booked, next, walk-in, confirming. */
export function Pill({ tone, children, className }: { tone: "priority" | "booked" | "next" | "walk" | "wait"; children: ReactNode; className?: string }) {
  const tones = {
    priority: "bg-peach text-deep",
    booked: "bg-lavender text-ink",
    next: "text-muted",
    walk: "bg-pink text-deep",
    wait: "bg-mustard/60 text-ink",
  } as const;
  return <span className={cn("inline-flex shrink-0 items-center rounded-chip px-2.5 py-1 text-xs leading-none", tones[tone], className)}>{children}</span>;
}

export function EntryPills({ entry, next }: { entry: QueueEntry; next?: boolean }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {entry.priority.length ? <Pill tone="priority">priority</Pill> : null}
      {entry.origin === "booking" ? <Pill tone="booked">booked</Pill> : null}
      {entry.origin === "counter" ? <Pill tone="walk">walk-in</Pill> : null}
      {entry.confirming ? <Pill tone="wait">confirming</Pill> : null}
      {next ? <Pill tone="next">next</Pill> : null}
    </span>
  );
}

/** A selectable chip with a check, as on the walk-in screen. Real button, real aria. */
export function Choice({ on, onClick, children, disabled, radio }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean; radio?: boolean }) {
  return (
    <button
      type="button"
      role={radio ? "radio" : "checkbox"}
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-chip px-3.5 py-2.5 text-[13.5px] leading-none transition active:scale-[.98] disabled:opacity-50",
        on ? "bg-mustard font-medium" : "border border-dashed border-ink/40 hover:bg-ink/[.03]",
      )}
    >
      {on ? <Icon name="check" size={13} strokeWidth={2.4} /> : null}
      {children}
    </button>
  );
}

export function StatTile({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[18px] bg-surface px-3.5 py-3 shadow-card", className)}>
      <span className="block text-xs text-muted">{label}</span>
      <b className="mt-1 block text-[26px] leading-none font-medium tracking-[-.8px]">{value}</b>
    </div>
  );
}
