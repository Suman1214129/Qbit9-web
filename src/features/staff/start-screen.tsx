"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, Button, Chip, Icon, Sheet, Skeleton, useToast } from "@/components/ui";
import { formatDayMonth, formatClock, tzParts, type StaffMember } from "@/domain";
import { useStartShift } from "@/hooks/staff/mutations";
import { useRoster } from "@/hooks/staff/queries";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { StaffMenu } from "./staff-shell";
import { StatTile } from "./entry-bits";
import { spokenMs } from "./staff-format";
import type { CounterOption } from "@/services/staff-types";

const hhmm = (v: string) => {
  const [h, m] = v.split(":");
  return `${Number(h)}:${m}`;
};

const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening");

/** Screen S2. The roster decides counter and services. Staff confirm with one tap and never pick services. */
export function StartScreen() {
  const router = useRouter();
  const toast = useToast();
  const now = useNow(30_000);
  const { data: roster, isPending } = useRoster();
  const start = useStartShift();
  const [pick, setPick] = useState(false);

  const status = roster?.shift.status;
  useEffect(() => {
    if (status === "open" || status === "break") router.replace("/staff/counter");
  }, [status, router]);

  if (isPending || !roster) {
    return (
      <div className="flex flex-col gap-4 pt-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-56" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  const tz = roster.branch.timezone;
  const first = roster.staff.name.split(" ")[0];
  const go = async (counter?: number) => {
    try {
      await start.mutateAsync(counter);
      router.replace("/staff/counter");
    } catch (e) {
      toast.show({ title: "Could not start your shift", body: errorMessage(e), tone: "warn" });
    }
  };

  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-5 pt-3 lg:pt-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <small className="text-[13px] text-muted">{formatDayMonth(now, tz)}</small>
          <h1 className="text-[28px] leading-[1.1] font-medium tracking-[-.7px] md:text-[34px]">{greeting(tzParts(now, tz).hour)}, {first}</h1>
          <p className="mt-1 text-sm text-muted">{roster.branch.bankName}, {roster.branch.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <StaffMenu />
          <Avatar initial={roster.staff.name.slice(0, 1)} size={40} className="hidden lg:flex" />
        </div>
      </header>

      {roster.lastShift ? <LastShift summary={roster.lastShift} tz={tz} /> : null}

      <section aria-labelledby="todays-counter" className="rounded-card bg-surface p-5 shadow-card">
        <span id="todays-counter" className="text-[13px] text-muted">Today&apos;s counter</span>
        <h2 className="text-[30px] leading-tight font-medium tracking-[-.8px]">Counter {roster.assigned.number}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {roster.assigned.serviceNames.map((n) => <Chip key={n} tone="mustard" className="px-3 py-2 text-[13px]">{n.toLowerCase()}</Chip>)}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-dashed border-line pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted">Your shift</dt>
            <dd className="mt-0.5 text-[17px] leading-tight font-medium">{hhmm(roster.shiftStart)} to {hhmm(roster.shiftEnd)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Counters open</dt>
            <dd className="mt-0.5 text-[17px] leading-tight font-medium">{roster.countersOpen} of {roster.countersTotal}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Waiting</dt>
            <dd className="mt-0.5 text-[17px] leading-tight font-medium">{roster.waiting}</dd>
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-3">
        <Button size="md" loading={start.isPending} onClick={() => go()}>Start shift at Counter {roster.assigned.number}</Button>
        <Button variant="link" onClick={() => setPick(true)}>Not at Counter {roster.assigned.number}? Choose another</Button>
      </div>
      {env.adapter === "mock" ? <p className="text-center text-xs text-muted">Demo mode: customers and earlier visits are simulated.</p> : null}

      <Sheet open={pick} onClose={() => setPick(false)} title="Choose your counter">
        <CounterList counters={roster.counters} staff={roster.staff} assigned={roster.assigned.number} busy={start.isPending} onPick={(n) => { setPick(false); void go(n); }} />
      </Sheet>
    </div>
  );
}

function LastShift({ summary, tz }: { summary: { served: number; noShows: number; avgServiceMs: number | null; endedAt: number }; tz: string }) {
  return (
    <section aria-label="Last shift" className="rounded-card bg-rose/60 p-4">
      <p className="flex items-center gap-2 text-[13.5px] text-deep"><Icon name="check" size={15} strokeWidth={2.4} />Shift ended at {formatClock(summary.endedAt, tz)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <StatTile label="Served" value={summary.served} />
        <StatTile label="Average" value={summary.avgServiceMs == null ? "None" : spokenMs(summary.avgServiceMs)} />
        <StatTile label="No-shows" value={summary.noShows} />
      </div>
    </section>
  );
}

function CounterList({ counters, staff, assigned, onPick, busy }: { counters: CounterOption[]; staff: StaffMember; assigned: number; onPick: (n: number) => void; busy: boolean }) {
  return (
    <ul className="mt-3 flex flex-col">
      {counters.map((c) => {
        const taken = c.takenBy != null && c.takenBy !== staff.name;
        return (
          <li key={c.number}>
            <button
              type="button"
              disabled={taken || busy}
              onClick={() => onPick(c.number)}
              className={cn("flex w-full items-center gap-3 border-b border-dashed border-line py-3 text-left transition-colors hover:bg-ink/[.025] disabled:opacity-55")}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose text-lg font-semibold text-deep">{c.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">Counter {c.number}{c.number === assigned ? " (your roster)" : ""}</span>
                <span className="block truncate text-[12.5px] text-muted">{c.serviceNames.length} {pluralize(c.serviceNames.length, "service")}: {c.serviceNames.slice(0, 2).join(", ").toLowerCase()}{c.serviceNames.length > 2 ? "..." : ""}</span>
              </span>
              <span className="text-xs text-muted">{taken ? `${c.takenBy} is here` : "Free"}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

