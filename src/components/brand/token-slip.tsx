import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getBankLogo } from "@/components/ui/avatar";

export interface SlipStat {
  label: string;
  value: ReactNode;
}

/** The ticket: rose card, big code, dashed tear line with notches, three stats underneath. */
export function TokenSlip({
  code,
  service,
  header,
  date,
  stats,
  bankKey,
  notch = "bg-bg",
  className,
}: {
  code: string;
  service: string;
  header: string;
  date?: string;
  stats: SlipStat[];
  bankKey?: string;
  /** Tailwind bg class matching whatever the slip sits on, so the notches look cut out. */
  notch?: string;
  className?: string;
}) {
  const logo = getBankLogo(bankKey || header);

  return (
    <section aria-label={`Token ${code}`} className={cn("relative overflow-hidden rounded-card bg-rose px-[18px] pt-[15px] text-deep", className)}>
      <div className="flex items-center justify-between gap-3 text-[12.5px] font-medium">
        <div className="flex min-w-0 items-center gap-2">
          {logo ? (
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white p-0.5 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" className="size-full object-contain" />
            </span>
          ) : null}
          <span className="truncate">{header}</span>
        </div>
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
