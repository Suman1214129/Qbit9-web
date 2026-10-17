import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SlipStat {
  label: string;
  value: ReactNode;
}

/** The ticket: rose card, big code, dashed tear line with notches, three stats underneath. */
export function TokenSlip({ code, service, header, date, stats, notch = "bg-bg", className }: {
  code: string;
  service: string;
  header: string;
  date?: string;
  stats: SlipStat[];
  /** Tailwind bg class matching whatever the slip sits on, so the notches look cut out. */
  notch?: string;
  className?: string;
}) {
  return (
    <section aria-label={`Token ${code}`} className={cn("relative overflow-hidden rounded-card bg-rose px-[18px] pt-[15px] text-deep", className)}>
      <div className="flex justify-between gap-3 text-[12.5px] font-medium">
        <span>{header}</span>
        {date ? <span className="shrink-0">{date}</span> : null}
      </div>
      <div className="mt-1.5 mb-0.5 text-[66px] leading-none font-semibold tracking-[-3px] md:text-[76px]" aria-hidden="true">{code}</div>
      <p className="text-sm">{service}</p>
      <div className="relative -mx-[18px] mt-3.5 border-t-[1.5px] border-dashed border-deep/45">
        <span aria-hidden="true" className={cn("absolute -top-[11px] -left-[11px] size-[22px] rounded-full", notch)} />
        <span aria-hidden="true" className={cn("absolute -top-[11px] -right-[11px] size-[22px] rounded-full", notch)} />
      </div>
      <dl className="flex justify-between gap-3 pt-3 pb-3.5">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-deep/70">{s.label}</dt>
            <dd className="text-[15.5px] font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
