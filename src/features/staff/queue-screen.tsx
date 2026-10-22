"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, EmptyState, InlineNote, Segmented, Sheet, Skeleton, useToast } from "@/components/ui";
import type { QueueEntry } from "@/domain";
import { useCallNext } from "@/hooks/staff/mutations";
import { useStaffQueue } from "@/hooks/staff/queries";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import type { QueueScope } from "@/services/staff-types";
import { EntryPills, StatTile } from "./entry-bits";
import { customerName, priorityLabel, waitingLabel } from "./staff-format";
import { StaffMenu } from "./staff-shell";

/** Screen S6: who is waiting, in call order. Tapping a row calls that person out of turn, after a confirm. */
export function QueueScreen() {
  const [scope, setScope] = useState<QueueScope>("mine");
  const { data, isPending } = useStaffQueue(scope);
  const now = useNow(15_000);
  const [pick, setPick] = useState<QueueEntry | null>(null);

  return (
    <div className="flex flex-col gap-4 pt-3 lg:pt-0">
      <header className="flex items-end justify-between gap-3 border-b border-ink pb-2">
        <div>
          <small className="text-[13px] text-muted">{data?.counter != null ? `Counter ${data.counter}` : "Not on a counter"}</small>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-.5px] md:text-[30px]">Queue</h1>
        </div>
        <div className="pb-1"><StaffMenu /></div>
      </header>

      <div className="max-w-[360px]">
        <Segmented<QueueScope>
          label="Which queue"
          value={scope}
          onChange={setScope}
          options={[
            { value: "mine", label: `My services${data ? ` (${data.mineCount})` : ""}` },
            { value: "all", label: `Branch${data ? ` (${data.allCount})` : ""}` },
          ]}
        />
      </div>

      {isPending || !data ? (
        <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-64" /></div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr] lg:gap-8">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <StatTile label="Waiting" value={data.waiting.length} />
              <StatTile label="Longest wait" value={data.longestWaitMin == null ? "None" : `${data.longestWaitMin} min`} />
            </div>
            {data.counter == null ? (
              <InlineNote icon="info">You have no open shift, so rows cannot be called. <Link href="/staff/start" className="underline">Start your shift</Link></InlineNote>
            ) : null}
            {data.waiting.length === 0 ? (
              <div className="rounded-card bg-surface p-2 shadow-card"><EmptyState icon="list" title="Nobody is waiting">New customers appear here as they join.</EmptyState></div>
            ) : (
              <ul aria-label="Waiting customers">
                {data.waiting.map((e, i) => {
                  const mine = data.myGroupIds.includes(e.groupId);
                  const callable = mine && data.counter != null && !e.confirming;
                  return (
                    <li key={e.id} className="border-b border-dashed border-line">
                      <button
                        type="button"
                        disabled={!callable}
                        onClick={() => setPick(e)}
                        className={cn("flex w-full items-center gap-3 py-3.5 text-left transition", callable ? "hover:bg-ink/[.025]" : "opacity-60")}
                      >
                        <b className="w-[74px] shrink-0 text-[22px] leading-tight font-medium tracking-[-.4px]">{e.code}</b>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px]">{customerName(e)}</span>
                          <span className="block truncate text-[12.5px] text-muted">{e.serviceName}, {priorityLabel(e) ?? waitingLabel(e, now)}</span>
                        </span>
                        <EntryPills entry={e} next={i === 0 && callable} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {scope === "all" ? <p className="text-[12.5px] text-muted">Rows for services your counter does not take are greyed out.</p> : null}
          </div>

          <aside aria-label="At counters" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium text-muted">At counters now</h2>
            {data.atCounters.length === 0 ? (
              <p className="text-sm text-muted">No one is at a counter right now.</p>
            ) : (
              <ul>
                {data.atCounters.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 border-b border-dashed border-line py-3">
                    <b className="w-[74px] shrink-0 text-[18px] font-medium">{e.code}</b>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">Counter {e.counter}, {e.status === "serving" ? "serving" : "called"}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      <CallOutOfTurn entry={pick} hasCurrent={!!data?.hasCurrent} first={data?.waiting[0]?.id === pick?.id} onClose={() => setPick(null)} />
    </div>
  );
}

function CallOutOfTurn({ entry, hasCurrent, first, onClose }: { entry: QueueEntry | null; hasCurrent: boolean; first: boolean; onClose: () => void }) {
  const call = useCallNext();
  const toast = useToast();
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry ? (first ? `Call ${entry.code} now?` : `Call ${entry.code} out of turn?`) : ""}>
      {entry ? (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-[14.5px] leading-snug text-muted">
            {first ? "They are next in line." : "Others who joined earlier will wait a little longer."}
            {hasCurrent ? ` Your current customer is closed as served first, so only do this when they are done.` : ""}
          </p>
          <div className="flex flex-col gap-2.5">
            <Button
              loading={call.isPending}
              onClick={async () => {
                try {
                  await call.mutateAsync({ entryId: entry.id, closeCurrentAs: hasCurrent ? "served" : undefined });
                  onClose();
                } catch (e) {
                  toast.show({ title: "Could not call", body: errorMessage(e), tone: "warn" });
                }
              }}
            >
              Call {entry.code}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

