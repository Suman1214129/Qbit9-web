"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, EmptyState, Icon, InlineNote, Sheet, Skeleton, useToast } from "@/components/ui";
import { BREAK_LABEL, BREAK_REASONS, isDomainError, type BreakReason, type QueueEntry } from "@/domain";
import { useCallNext, useFinishCurrent, useHold, useRecall, useResume, useResumeFromBreak, useSnoozeNudge, useStartBreak } from "@/hooks/staff/mutations";
import { useCounter } from "@/hooks/staff/queries";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { pluralize } from "@/lib/format";
import type { CounterState } from "@/services/staff-types";
import { Choice, EntryPills, Pill, StatTile } from "./entry-bits";
import { EndShiftSheet } from "./end-shift-sheet";
import { NoteSheet, NotArrivedSheet, TransferSheet } from "./counter-sheets";
import { callStatusLabel, clockMs, customerName, priorityLabel, spokenMs, waitingLabel } from "./staff-format";
import { ShiftChip, StaffMenu } from "./staff-shell";

/** Screens S3 to S5 and S8: ready, serving, still serving and break are views of one counter state. */
export function CounterScreen() {
  const router = useRouter();
  const { data: state, error, isPending } = useCounter();
  const now = useNow(1000);

  useEffect(() => {
    if (error && isDomainError(error) && error.code === "shift_not_started") router.replace("/staff/start");
  }, [error, router]);

  if (isPending || !state) {
    return (
      <div className="flex flex-col gap-4 pt-6" aria-busy="true">
        <Skeleton className="h-12 w-56" />
        <Skeleton className="h-20" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-3 lg:pt-0">
      <header className="flex items-end justify-between gap-3 border-b border-ink pb-2">
        <div>
          <small className="text-[13px] text-muted">{state.branch.bankShort}, {state.branch.name.replace(" Branch", "")}</small>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-.5px] md:text-[30px]">Counter {state.counter.number}</h1>
        </div>
        <div className="flex items-center gap-2 pb-1">
          <ShiftChip status={state.shift.status} />
          <StaffMenu />
        </div>
      </header>

      {state.onBreak ? <BreakView state={state} now={now} /> : state.current ? <ServingView state={state} now={now} /> : <ReadyView state={state} now={now} />}
    </div>
  );
}

/* ------------------------------------------------------------------ call logic */

/** Shared by the ready and serving views: calling the next person, and what to do about someone who never arrived. */
function useCaller(state: CounterState) {
  const toast = useToast();
  const call = useCallNext();
  const finish = useFinishCurrent();
  const [confirm, setConfirm] = useState(false);
  const cur = state.current;
  const next = state.nextCallable;

  const fail = (title: string, e: unknown) => toast.show({ title, body: errorMessage(e), tone: "warn" });

  const callNext = async () => {
    // Someone who has not arrived must be closed on purpose, so ask before anything changes.
    if (cur && cur.status === "called") return setConfirm(true);
    try {
      await call.mutateAsync(undefined);
    } catch (e) {
      fail("Could not call the next person", e);
    }
  };

  const noShow = async () => {
    try {
      if (next) await call.mutateAsync({ closeCurrentAs: "no_show" });
      else await finish.mutateAsync("no_show");
      setConfirm(false);
    } catch (e) {
      fail("Could not close the visit", e);
    }
  };

  const finishNow = async () => {
    try {
      await finish.mutateAsync(undefined);
    } catch (e) {
      fail("Could not finish the visit", e);
    }
  };

  return { callNext, noShow, finishNow, confirm, setConfirm, busy: call.isPending || finish.isPending };
}

/* ------------------------------------------------------------------- ready view */

function ReadyView({ state, now }: { state: CounterState; now: number }) {
  const caller = useCaller(state);
  const [end, setEnd] = useState(false);
  const next = state.nextCallable;
  const blocked = !next && state.next[0]?.confirming ? state.next[0] : null;
  const rest = state.next.filter((e) => e.id !== next?.id);
  const brk = useStartBreak();
  const toast = useToast();

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2.5">
          <StatTile label="Waiting" value={state.waitingMine} />
          <StatTile label="Served today" value={state.served} />
          <StatTile label="Average" value={state.avgServiceMs == null ? "None" : spokenMs(state.avgServiceMs)} />
        </div>

        {next ? (
          <section aria-label="Next up" className="rounded-card bg-rose p-5">
            <span className="text-[13px] text-deep/75">Next up</span>
            <b className="block text-[52px] leading-[1.05] font-medium tracking-[-2px] text-deep md:text-[64px]">{next.code}</b>
            <p className="mt-1 text-[17px] font-medium text-deep">{customerName(next)}</p>
            <p className="text-sm text-deep/80">{next.serviceName}, {waitingLabel(next, now).toLowerCase()}</p>
            <div className="mt-3 flex flex-wrap gap-1.5"><EntryPills entry={next} /></div>
          </section>
        ) : (
          <section className="rounded-card bg-surface p-2 shadow-card">
            <EmptyState icon="ticket" title={blocked ? `${blocked.code} is confirming` : "Nobody is waiting"}>
              {blocked ? `${customerName(blocked)} is checking in that they are still at the branch. They can be called once they confirm.` : "New customers appear here as they join. You do not need to refresh."}
            </EmptyState>
          </section>
        )}

        <div className="sticky bottom-[calc(76px+var(--safe-bottom))] z-10 flex flex-col gap-2 lg:static">
          <Button size="md" disabled={!next} loading={caller.busy} onClick={caller.callNext} className="shadow-pop lg:shadow-none">
            {next ? <>Call next <span className="ml-1 rounded-chip bg-white/20 px-2.5 py-1 text-[13px]">{next.code}</span></> : "No one to call"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {rest.length ? (
          <section aria-label="Then">
            <h2 className="mb-1 text-sm font-medium text-muted">Then</h2>
            <ul>{rest.map((e) => <MiniRow key={e.id} entry={e} now={now} />)}</ul>
          </section>
        ) : null}

        {state.held.length ? <HeldList held={state.held} /> : null}

        <section aria-label="Away" className="rounded-card bg-surface p-4 shadow-card">
          <h2 className="text-sm font-medium">Stepping away?</h2>
          <p className="mt-0.5 text-[13px] text-muted">Pausing keeps wait estimates honest for customers.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BREAK_REASONS.map((r) => (
              <Choice key={r} on={false} radio disabled={brk.isPending} onClick={async () => {
                try { await brk.mutateAsync(r); } catch (e) { toast.show({ title: "Could not pause", body: errorMessage(e), tone: "warn" }); }
              }}>{BREAK_LABEL[r].toLowerCase()}</Choice>
            ))}
            <Choice on={false} radio onClick={() => setEnd(true)}>end shift</Choice>
          </div>
        </section>
      </div>

      <NotArrivedSheetFor state={state} now={now} caller={caller} />
      <EndShiftSheet open={end} onClose={() => setEnd(false)} hasCurrent={false} waitingMine={state.waitingMine} />
    </div>
  );
}

function MiniRow({ entry, now }: { entry: QueueEntry; now: number }) {
  return (
    <li className="flex items-center gap-3 border-b border-dashed border-line py-3">
      <b className="w-[74px] shrink-0 text-[20px] leading-tight font-medium tracking-[-.4px]">{entry.code}</b>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{entry.serviceName}</span>
        <span className="block text-[12.5px] text-muted">{priorityLabel(entry) ?? waitingLabel(entry, now)}</span>
      </span>
      <EntryPills entry={entry} />
    </li>
  );
}

function NotArrivedSheetFor({ state, now, caller }: { state: CounterState; now: number; caller: ReturnType<typeof useCaller> }) {
  if (!state.current || state.current.status !== "called") return null;
  return <NotArrivedSheet open={caller.confirm} onClose={() => caller.setConfirm(false)} current={state.current} next={state.nextCallable} now={now} busy={caller.busy} onNoShow={caller.noShow} />;
}

/* ----------------------------------------------------------------- serving view */

function ServingView({ state, now }: { state: CounterState; now: number }) {
  const cur = state.current as QueueEntry;
  const toast = useToast();
  const caller = useCaller(state);
  const recall = useRecall();
  const hold = useHold();
  const snooze = useSnoozeNudge();
  const [transfer, setTransfer] = useState(false);
  const [note, setNote] = useState(false);
  const [end, setEnd] = useState(false);

  const serving = cur.status === "serving";
  const usualMs = cur.avgServiceMin * 60_000;
  const since = serving ? now - (cur.arrivedAt ?? now) : now - (cur.calledAt ?? now);
  const pct = serving ? Math.min(100, Math.round((since / usualMs) * 100)) : 0;
  const windowLeft = cur.callDeadline != null ? cur.callDeadline - now : null;
  const next = state.nextCallable;
  const recallsLeft = Math.max(0, 2 - cur.recalls);
  const run = (title: string, fn: () => Promise<unknown>) => fn().catch((e) => toast.show({ title, body: errorMessage(e), tone: "warn" }));

  return (
    <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr] lg:gap-8">
      <div className="flex flex-col gap-4">
        <section aria-label="Serving now" className="rounded-card bg-rose p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-[13px] text-deep/75">{serving ? "Serving now" : "Called"}</span>
            <span className="inline-flex items-center gap-1.5 rounded-chip bg-white px-2.5 py-1.5 text-xs leading-none">
              <span className={cn("size-1.5 rounded-full", serving ? "bg-ok" : cur.replied ? "bg-ok" : "bg-coral")} />
              {callStatusLabel(cur, now)}
            </span>
          </div>
          <b className="block text-[56px] leading-[1.05] font-medium tracking-[-2px] text-deep md:text-[68px]">{cur.code}</b>
          <p className="mt-1 text-[18px] font-medium text-deep">{customerName(cur)}</p>
          <p className="text-sm text-deep/80">{cur.serviceName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5"><EntryPills entry={cur} />{cur.note ? <Pill tone="wait">note: {cur.note}</Pill> : null}</div>
        </section>

        <div>
          <div className="flex items-end justify-between">
            <b className="text-[44px] leading-none font-medium tracking-[-1.5px]" aria-label={serving ? "Time at the counter" : "Time since the call"}>{clockMs(since)}</b>
            <span className="text-[13px] text-muted">{serving ? `usual ${clockMs(usualMs)}` : windowLeft != null ? `window closes in ${clockMs(windowLeft)}` : ""}</span>
          </div>
          {serving ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Time against the usual">
              <div className={cn("h-full rounded-full transition-[width]", pct >= 100 ? "bg-coral" : "bg-primary")} style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2.5">
          <ActionTile icon="bell" label="Recall" sub={!serving ? `${recallsLeft} left` : undefined} disabled={serving || recallsLeft === 0 || recall.isPending} onClick={() => run("Could not recall", () => recall.mutateAsync())} />
          <ActionTile icon="arrow" label="Transfer" onClick={() => setTransfer(true)} />
          <ActionTile icon="clock" label="Hold" disabled={!serving || hold.isPending} onClick={() => run("Could not hold", () => hold.mutateAsync())} />
          <ActionTile icon="list" label="Note" onClick={() => setNote(true)} />
        </div>

        <div className="sticky bottom-[calc(76px+var(--safe-bottom))] z-10 flex flex-col gap-2 lg:static">
          {next ? (
            <Button loading={caller.busy} onClick={caller.callNext} className="shadow-pop lg:shadow-none">
              Call next <span className="ml-1 rounded-chip bg-white/20 px-2.5 py-1 text-[13px]">{next.code}{next.priority.length ? ", priority" : ""}</span>
            </Button>
          ) : serving ? (
            <Button loading={caller.busy} onClick={caller.finishNow} className="shadow-pop lg:shadow-none">Finish {cur.code}</Button>
          ) : (
            <Button variant="danger" loading={caller.busy} onClick={() => caller.setConfirm(true)}>Mark {cur.code} as no-show</Button>
          )}
          <p className="text-center text-[12.5px] text-muted">
            {next ? `Calling next closes ${cur.code} automatically.` : serving ? "Nobody is waiting. Finish when the visit is done." : "Nobody is waiting."}
          </p>
          {!serving && next ? <button type="button" onClick={() => caller.setConfirm(true)} className="self-center text-[13px] text-muted underline underline-offset-[3px] hover:text-ink">Not coming? Mark {cur.code} as no-show</button> : null}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {state.held.length ? (
          <section aria-label="On hold" className="rounded-card bg-surface p-4 shadow-card">
            <h2 className="text-sm font-medium">On hold</h2>
            <ul className="mt-1">
              {state.held.map((h) => (
                <li key={h.id} className="flex items-center gap-3 border-b border-dashed border-line py-3 last:border-b-0">
                  <b className="text-[18px] font-medium">{h.code}</b>
                  <span className="min-w-0 flex-1 truncate text-sm text-muted">{customerName(h)}</span>
                                  </li>
              ))}
            </ul>
            <InlineNote>Resume a held customer once your counter is clear.</InlineNote>
          </section>
        ) : null}

        {state.next.length ? (
          <section aria-label="Next in line">
            <h2 className="mb-1 text-sm font-medium text-muted">Next in line</h2>
            <ul>{state.next.map((e) => <MiniRow key={e.id} entry={e} now={now} />)}</ul>
          </section>
        ) : null}

        <Button variant="link" onClick={() => setEnd(true)} className="self-start">End shift</Button>
      </div>

      <NotArrivedSheetFor state={state} now={now} caller={caller} />
      <TransferSheet open={transfer} onClose={() => setTransfer(false)} state={state} />
      {note ? <NoteSheet open={note} onClose={() => setNote(false)} current={cur} /> : null}
      <EndShiftSheet open={end} onClose={() => setEnd(false)} hasCurrent waitingMine={state.waitingMine} />

      <Sheet open={state.nudge} onClose={() => {}} dismissible={false} title={`Still with ${cur.code}?`}>
        <div className="mt-2 flex flex-col gap-4">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-rose text-deep"><Icon name="clock" size={22} /></span>
          <p className="text-[14.5px] leading-snug text-muted">{Math.floor(since / 60_000)} min so far. The usual time for this service is about {cur.avgServiceMin} min.</p>
          <div className="flex flex-col gap-2.5">
            {next ? (
              <Button loading={caller.busy} onClick={caller.callNext}>Call next <span className="ml-1 rounded-chip bg-white/20 px-2.5 py-1 text-[13px]">{next.code}</span></Button>
            ) : (
              <Button loading={caller.busy} onClick={caller.finishNow}>Finish {cur.code}</Button>
            )}
            <Button variant="outline" loading={snooze.isPending} onClick={() => run("Could not update", () => snooze.mutateAsync())}>Still serving</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function ActionTile({ icon, label, sub, onClick, disabled }: { icon: "bell" | "arrow" | "clock" | "list"; label: string; sub?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 rounded-[18px] bg-surface px-1 py-3.5 text-[13px] shadow-card transition active:scale-[.97] enabled:hover:bg-white disabled:opacity-45"
    >
      <Icon name={icon} size={20} className="text-primary-strong" />
      {label}
      {sub ? <span className="-mt-1 text-[11px] text-muted">{sub}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------- break view */

function BreakView({ state, now }: { state: CounterState; now: number }) {
  const info = state.onBreak as NonNullable<CounterState["onBreak"]>;
  const toast = useToast();
  const brk = useStartBreak();
  const resume = useResumeFromBreak();
  const [end, setEnd] = useState(false);
  const group = state.counter.serviceNames[0]?.toLowerCase().includes("cash") ? "Cash services" : "Your services";

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <section aria-label="Paused" className="rounded-card bg-rose px-5 py-8 text-center">
        <span className="text-[13px] text-deep/75">Paused for</span>
        <b className="block text-[64px] leading-[1.05] font-medium tracking-[-2.5px] text-deep md:text-[80px]">{clockMs(now - info.startedAt)}</b>
        <span className="text-[15px] text-deep">{BREAK_LABEL[info.reason]}</span>
      </section>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Break reason">
        {BREAK_REASONS.map((r: BreakReason) => (
          <Choice key={r} on={r === info.reason} radio disabled={brk.isPending} onClick={async () => {
            if (r === info.reason) return;
            try { await brk.mutateAsync(r); } catch (e) { toast.show({ title: "Could not change the reason", body: errorMessage(e), tone: "warn" }); }
          }}>{BREAK_LABEL[r].toLowerCase()}</Choice>
        ))}
        <Choice on={false} radio onClick={() => setEnd(true)}>end shift</Choice>
      </div>

      <div className="flex items-start gap-3 rounded-[18px] bg-surface p-4 shadow-card">
        <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-primary-strong" />
        <div className="text-[14.5px] leading-snug">
          {info.impactMin > 0 ? (
            <>
              <b className="block font-medium">{group} slow down while you are away</b>
              <span className="text-[13px] text-muted">Wait estimates rise by about {info.impactMin} {pluralize(info.impactMin, "min", "min")} until you resume.</span>
            </>
          ) : (
            <>
              <b className="block font-medium">Customers will barely notice</b>
              <span className="text-[13px] text-muted">There is little or no queue for your services right now.</span>
            </>
          )}
        </div>
      </div>

      <Button size="xl" loading={resume.isPending} onClick={async () => {
        try { await resume.mutateAsync(); } catch (e) { toast.show({ title: "Could not resume", body: errorMessage(e), tone: "warn" }); }
      }}>Resume counter</Button>

      <EndShiftSheet open={end} onClose={() => setEnd(false)} hasCurrent={false} waitingMine={state.waitingMine} />
    </div>
  );
}


function HeldList({ held }: { held: QueueEntry[] }) {
  const resume = useResume();
  const toast = useToast();
  return (
    <section aria-label="On hold" className="rounded-card bg-surface p-4 shadow-card">
      <h2 className="text-sm font-medium">On hold</h2>
      <ul className="mt-1">
        {held.map((h) => (
          <li key={h.id} className="flex items-center gap-3 border-b border-dashed border-line py-3 last:border-b-0">
            <b className="text-[18px] font-medium">{h.code}</b>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{customerName(h)}</span>
            <Button size="sm" variant="outline" block={false} loading={resume.isPending} onClick={() => resume.mutateAsync(h.id).catch((e) => toast.show({ title: "Could not resume", body: errorMessage(e), tone: "warn" }))}>Resume</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
