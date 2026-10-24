"use client";
import { useState } from "react";
import { Button, InlineNote, Skeleton, useToast } from "@/components/ui";
import { formatClock } from "@/domain";
import { useUndoClosure } from "@/hooks/staff/mutations";
import { useStaffToday } from "@/hooks/staff/queries";
import { errorMessage } from "@/lib/errors";
import { StatTile } from "./entry-bits";
import { EndShiftSheet } from "./end-shift-sheet";
import { customerName, spokenMs } from "./staff-format";
import { StaffMenu } from "./staff-shell";

/** Screen S9: the day so far for this counter, and the place to undo an automatic no-show. */
export function TodayScreen() {
  const { data, isPending } = useStaffToday();
  const undo = useUndoClosure();
  const toast = useToast();
  const [end, setEnd] = useState(false);

  if (isPending || !data) {
    return <div className="flex flex-col gap-4 pt-6" aria-busy="true"><Skeleton className="h-10 w-48" /><Skeleton className="h-24" /><Skeleton className="h-48" /></div>;
  }
  const { summary } = data;
  const max = Math.max(1, ...summary.hourly.map((h) => h.count));
  const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`;

  return (
    <div className="flex flex-col gap-4 pt-3 lg:pt-0">
      <header className="flex items-end justify-between gap-3 border-b border-ink pb-2">
        <div>
          <small className="text-[13px] text-muted">{data.counter != null ? `Counter ${data.counter}` : "No open shift"}</small>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-.5px] md:text-[30px]">Today</h1>
        </div>
        <div className="pb-1"><StaffMenu /></div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile label="Served" value={summary.served} />
            <StatTile label="No-shows" value={summary.noShows} />
            <StatTile label="Average" value={summary.avgServiceMs == null ? "None" : spokenMs(summary.avgServiceMs)} />
          </div>

          <section aria-label="Served per hour" className="rounded-card bg-surface p-4 shadow-card">
            <h2 className="text-sm font-medium">Served per hour</h2>
            <div className="mt-4 flex h-32 items-end gap-2" role="img" aria-label={`Served per hour: ${summary.hourly.map((h) => `${hourLabel(h.hour)} ${h.count}`).join(", ")}`}>
              {summary.hourly.map((h) => (
                <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[11px] text-muted">{h.count || ""}</span>
                  <div className="w-full max-w-9 rounded-t-md bg-primary" style={{ height: `${Math.max(h.count ? 8 : 2, (h.count / max) * 80)}%`, opacity: h.count ? 1 : 0.25 }} />
                  <span className="text-[11px] text-muted">{hourLabel(h.hour)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section aria-label="Closed automatically" className="rounded-card bg-surface p-4 shadow-card">
            <h2 className="text-sm font-medium">Closed as no-show</h2>
            {data.autoClosed.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">Nobody was closed automatically. If a called customer does not come, they appear here and can be called again.</p>
            ) : (
              <ul className="mt-1">
                {data.autoClosed.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 border-b border-dashed border-line py-3 last:border-b-0">
                    <b className="text-[18px] font-medium">{e.code}</b>
                    <span className="min-w-0 flex-1 text-sm text-muted">
                      <span className="block truncate">{customerName(e)}</span>
                      {e.closedAt != null ? <span className="block text-[12px]">closed {formatClock(e.closedAt, "Asia/Kolkata")}</span> : null}
                    </span>
                    <Button
                      size="sm" variant="outline" block={false} disabled={data.hasCurrent} loading={undo.isPending && undo.variables === e.id}
                      onClick={() => undo.mutateAsync(e.id).catch((err) => toast.show({ title: "Could not call again", body: errorMessage(err), tone: "warn" }))}
                    >
                      Call again
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {data.autoClosed.length && data.hasCurrent ? <InlineNote>Finish your current customer to call someone again.</InlineNote> : null}
          </section>

          <Button variant="outline" disabled={data.shift.status === "idle" || data.shift.status === "ended"} onClick={() => setEnd(true)}>End shift</Button>
        </div>
      </div>

      <EndShiftSheet open={end} onClose={() => setEnd(false)} hasCurrent={data.hasCurrent} waitingMine={data.waitingMine} />
    </div>
  );
}
