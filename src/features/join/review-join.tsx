"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon, InlineNote, Skeleton } from "@/components/ui";
import { StatRow } from "@/components/ui";
import { FlowShell } from "@/components/layout";
import {
  PRIORITY_TAGS, aheadForNewToken, maskEmail, maskPhone, ordinal,
  type PriorityTag, type WaitRange,
} from "@/domain";
import { useJoinQueue } from "@/hooks/mutations";
import { useCatalogue } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { errorCode, errorMessage } from "@/lib/errors";
import { formatWaitRange } from "@/lib/format";
import { clearDraft, setDraft } from "./draft";
import { useJoinGuard } from "./use-join-guard";

const PRIORITY_LABEL: Record<PriorityTag, string> = { senior_citizen: "Senior citizen", pensioner: "Pensioner", disability: "Disability" };

function scale(w: WaitRange, factor: number): WaitRange {
  if (w.maxMin <= 0 || factor >= 1) return w;
  const minMin = Math.max(1, Math.round(w.minMin * factor));
  return { minMin, maxMin: Math.max(minMin + 1, Math.round(w.maxMin * factor)) };
}

/** Screen 9. A last look before a token exists. */
export function ReviewJoin() {
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const { ready, draft, session, locationHref } = useJoinGuard({ paused: joined });
  const { data: catalogue } = useCatalogue(draft.branchId);
  const join = useJoinQueue();
  const [error, setError] = useState<string | null>(null);

  const service = catalogue?.flatMap((g) => g.services).find((s) => s.id === draft.serviceId) ?? null;

  // Start from the customer's saved priority, then let them change it for this visit only.
  const savedPriority = session?.user.priority;
  const priority = useMemo(() => (draft.priorityTouched ? draft.priority : (savedPriority ?? [])), [draft.priorityTouched, draft.priority, savedPriority]);
  useEffect(() => {
    if (ready && !joined && !draft.serviceId) router.replace("/join/service");
  }, [ready, joined, draft.serviceId, router]);

  const preview = useMemo(() => {
    if (!service) return null;
    const ahead = aheadForNewToken(service.waiting, { priority, source: "walk_in" });
    const factor = service.waiting > 0 ? ahead / service.waiting : 1;
    return { ahead, wait: scale(service.usualWait, factor) };
  }, [service, priority]);

  const toggle = (t: PriorityTag) => setDraft({ priorityTouched: true, priority: priority.includes(t) ? priority.filter((x) => x !== t) : [...priority, t] });

  const submit = async () => {
    if (!draft.branchId || !draft.serviceId || !draft.proof) return;
    setError(null);
    try {
      const token = await join.mutateAsync({ branchId: draft.branchId, serviceId: draft.serviceId, priority, proof: draft.proof });
      setJoined(true);
      clearDraft();
      router.replace(`/token/${token.code}?new=1`);
    } catch (e) {
      const code = errorCode(e);
      if (code === "location_stale" || code === "location_inaccurate" || code === "location_required") {
        if (locationHref) router.replace(`${locationHref}?reason=stale`);
      } else if (code === "already_in_queue") {
        const t = (e as { details?: { code?: string } }).details?.code;
        router.replace(t ? `/token/${t}` : "/home");
      } else if (code === "not_signed_in") {
        router.replace("/sign-in");
      } else {
        setError(errorMessage(e));
      }
    }
  };

  const identity = session?.user.phone ? maskPhone(session.user.phone) : session?.user.email ? maskEmail(session.user.email) : "";

  return (
    <FlowShell step={4} title="Review and join" back="/join/service" branch={draft.branchName ? { bankName: draft.branchName.split(",")[0] ?? "", bankShort: "", branchName: draft.branchName } : null}>
      {!ready || !service ? (
        <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-40" /><Skeleton className="h-24" /></div>
      ) : (
        <>
          <div>
            <StatRow label="Branch">{draft.branchName}</StatRow>
            <StatRow label="Service">{service.name}</StatRow>
            {session?.user.name ? <StatRow label="Name">{session.user.name}</StatRow> : null}
            <StatRow label={session?.user.phone ? "Mobile" : "Email"}>{identity}</StatRow>
          </div>

          <fieldset className="mt-1">
            <legend className="text-sm font-medium">Priority, if it applies</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRIORITY_TAGS.map((t) => {
                const on = priority.includes(t);
                return (
                  <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)} className={cn("inline-flex items-center gap-1.5 rounded-chip px-3 py-2 text-[13px] transition-colors", on ? "bg-pink font-medium" : "border border-dashed border-ink/40 hover:bg-ink/[.03]")}>
                    {on ? <Icon name="check" size={12} strokeWidth={2.6} /> : null}
                    {PRIORITY_LABEL[t]}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Staff may check at the counter.</p>
          </fieldset>

          {preview ? (
            <div className="mt-1 rounded-[20px] bg-rose p-4 text-deep">
              <p className="text-[22px] leading-tight font-semibold tracking-[-.4px]">
                {preview.ahead === 0 ? "You would be next" : `You would be ${ordinal(preview.ahead + 1)} in line`}
              </p>
              <p className="mt-1 text-[13px] text-deep/80">Usual wait {formatWaitRange(preview.wait)}. What to bring comes next.</p>
            </div>
          ) : null}

          {error ? <InlineNote tone="warn" icon="warn">{error}</InlineNote> : null}

          <div className="mt-auto pt-3">
            <Button loading={join.isPending} onClick={submit} icon="ticket">Join the queue</Button>
            <p className="mt-2.5 text-center text-xs text-muted">Your number is saved the moment you join. You can leave the queue any time.</p>
          </div>
        </>
      )}
    </FlowShell>
  );
}
