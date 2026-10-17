"use client";
import { useState } from "react";
import { Button, Icon, InlineNote } from "@/components/ui";
import { type Branch, type TokenView } from "@/domain";
import { useConfirmCheckin, useTokenAction } from "@/hooks/mutations";
import { useLocationCheck } from "@/hooks/use-location-check";
import { errorMessage } from "@/lib/errors";
import { formatCountdown, formatDistance, formatWaitRange } from "@/lib/format";

/** Screen 13. Browsers cannot track location in the background, so we ask again when the token is nearly up. */
export function CheckinView({ token, branch, now }: { token: TokenView; branch: Branch | null | undefined; now: number }) {
  const { check } = useLocationCheck(branch);
  const confirm = useConfirmCheckin();
  const moveBack = useTokenAction("moveBack");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const left = token.checkinDeadline ? token.checkinDeadline - now : 0;

  const doCheckin = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const s = await check();
      if (s.status === "failed") {
        setProblem(s.reason === "denied" ? "Location is blocked for this site. Allow it in your browser, then try again, or ask to be moved back." : "We could not read your location. Try again.");
      } else if (s.status === "ready") {
        if (s.result.status === "too_far") setProblem(`You seem to be ${formatDistance(s.result.distanceM)} from the branch. Check in once you are back, or move back in line.`);
        else if (s.result.status !== "within") setProblem("Your location is not precise enough. Try again near a window.");
        else await confirm.mutateAsync({ id: token.id, proof: s.proof });
      }
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-[520px] gap-5">
      <div>
        <span className="flex size-12 items-center justify-center rounded-2xl bg-mustard/60"><Icon name="pin" size={22} /></span>
        <h2 className="mt-3 text-[28px] leading-[1.05] font-semibold tracking-[-.9px]">Still at the branch?</h2>
        <p className="mt-2 text-[15px] leading-snug text-muted">You are {token.ahead} away. Check in so the counter knows you are coming.</p>
      </div>

      <dl className="flex gap-2.5">
        <div className="flex-1 text-[12.5px] text-muted"><dt>Ahead of you</dt><dd className="text-[26px] font-semibold tracking-tight text-ink">{token.ahead}</dd></div>
        <div className="flex-1 text-[12.5px] text-muted"><dt>Estimated wait</dt><dd className="mt-1 text-[17px] font-medium text-ink">{formatWaitRange(token.estWait)}</dd></div>
        <div className="flex-1 text-[12.5px] text-muted"><dt>Time to confirm</dt><dd className="mt-1 text-[17px] font-medium tabular-nums text-ink" aria-live="off">{formatCountdown(left)}</dd></div>
      </dl>

      {problem ? <InlineNote tone="warn" icon="warn">{problem}</InlineNote> : null}

      <div className="flex flex-col gap-2.5">
        <Button icon="check" loading={busy || confirm.isPending} onClick={doCheckin}>Check in to confirm</Button>
        <Button variant="link" disabled={moveBack.isPending} onClick={() => moveBack.mutate(token.id)}>I am running late, move me back</Button>
      </div>
      <p className="text-center text-xs text-muted">If we cannot confirm in 3 minutes, your place moves back. It is never cancelled.</p>
    </div>
  );
}
