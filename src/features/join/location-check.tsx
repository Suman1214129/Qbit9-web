"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BranchMap } from "@/components/brand";
import { Button, Chip, EmptyState, Icon, InlineNote, Sheet, Skeleton } from "@/components/ui";
import { FlowShell } from "@/components/layout";
import { useBranch, useSession } from "@/hooks/queries";
import { useLocationCheck, type LocationState } from "@/hooks/use-location-check";
import { formatDistance } from "@/lib/format";
import { setDraft } from "./draft";

/** Screens 3, 4 and 5: the one location check, and the three ways it can go. */
export function LocationCheck({ bank, slug }: { bank: string; slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: branch, isPending } = useBranch(bank, slug);
  const { data: session } = useSession();
  const { state, check, permission } = useLocationCheck(branch);
  const [counterHelp, setCounterHelp] = useState(false);
  const started = useRef(false);

  const reason = params.get("reason");

  useEffect(() => {
    if (branch && params.get("auto") === "1" && !started.current) {
      started.current = true;
      void check().then((s) => s.status === "ready" && s.result.status === "within" && setDraft({ proof: s.proof }));
    }
  }, [branch, params, check]);

  if (isPending) return <FlowShell step={1} title="Location check"><Skeleton className="h-52" /></FlowShell>;
  if (!branch) return <FlowShell step={1} title="Location check"><EmptyState icon="pin" title="Branch not found" action={<Button href="/branches">Find your branch</Button>} /></FlowShell>;

  const base = `/b/${bank}/${slug}`;
  const label = `${branch.bank.shortName} ${branch.name.replace(" Branch", "")}`;
  const shell = { bankName: branch.bank.name, bankShort: branch.bank.shortName, branchName: branch.name };

  const run = async () => {
    const s = await check();
    if (s.status === "ready" && s.result.status === "within") setDraft({ proof: s.proof });
  };

  const proceed = () => router.push(session ? "/join/service" : "/sign-in");

  const failed = state.status === "failed";
  const ready = state.status === "ready" ? state : null;
  const within = ready?.result.status === "within";
  const tooFar = ready?.result.status === "too_far";
  const imprecise = ready?.result.status === "low_accuracy" || ready?.result.status === "stale";

  return (
    <FlowShell step={1} title={failed && state.reason === "denied" ? "Location blocked" : "Location check"} back={base} branch={shell}>
      {reason === "stale" && state.status === "idle" ? <InlineNote tone="warn" icon="clock">Your earlier location reading is out of date. Check again to join.</InlineNote> : null}

      {(state.status === "idle" || state.status === "checking") && (
        <>
          <div className="h-[196px] overflow-hidden rounded-card"><BranchMap branchLabel={label} radiusM={branch.joinRadiusM} /></div>
          <h2 className="text-[19px] font-semibold">We need your location once</h2>
          <p className="text-sm leading-snug text-muted">To confirm you are at {label}. Joining is open within about {branch.joinRadiusM} m of the branch.</p>
          <Privacy />
          <Button className="mt-auto" icon="pin" loading={state.status === "checking"} onClick={run}>
            {state.status === "checking" ? "Checking your location" : "Share location"}
          </Button>
          {permission === "denied" ? <InlineNote tone="warn">Your browser is blocking location for this site. You will see how to fix it if the check fails.</InlineNote> : null}
        </>
      )}

      {ready && (within || tooFar) && (
        <>
          <div className="relative h-[196px] overflow-hidden rounded-card">
            <BranchMap branchLabel={label} distanceM={ready.result.distanceM} radiusM={branch.joinRadiusM} />
            <Chip tone={within ? "ok" : "peach"} icon="pin" className="absolute top-3 left-3 bg-white/90 shadow-ibn">
              {formatDistance(ready.result.distanceM)} {within ? "from the branch" : "away"}
            </Chip>
          </div>
          {within ? (
            <>
              <h2 className="text-[22px] font-semibold tracking-[-.4px]">You are at the branch</h2>
              <p className="text-sm leading-snug text-muted">About {formatDistance(ready.result.distanceM)} from {label}. Joining is open within the dashed ring (about {branch.joinRadiusM} m).</p>
              <Privacy />
              <Button className="mt-auto" iconRight="arrow" onClick={proceed}>{session ? "Continue" : "Continue to sign in"}</Button>
            </>
          ) : (
            <>
              <h2 className="text-[22px] font-semibold tracking-[-.4px]">You are too far to join</h2>
              <p className="text-sm leading-snug text-muted">Queues open to people at the branch, so places stay fair for those waiting. You are about {formatDistance(ready.result.distanceM)} away.</p>
              <div className="mt-auto flex flex-col gap-2.5">
                <Button href={`/book?branch=${branch.id}`} icon="cal">Book a visit instead</Button>
                <Button variant="link" onClick={run}>Check again</Button>
              </div>
            </>
          )}
        </>
      )}

      {imprecise && (
        <>
          <EmptyState icon="compass" title="Your location is not precise enough">
            {ready?.result.status === "stale" ? "That reading is out of date." : `Your device reported about ${Math.round(ready?.result.accuracyM ?? 0)} m of error.`} Turn on precise location or step near a window, then try again.
          </EmptyState>
          <Button className="mt-auto" icon="refresh" onClick={run}>Try again</Button>
        </>
      )}

      {failed && state.reason === "denied" && <Blocked onRetry={run} onCounter={() => setCounterHelp(true)} />}
      {failed && state.reason !== "denied" && (
        <>
          <EmptyState icon="compass" title={state.reason === "unsupported" ? "This device cannot share location" : "We could not get your location"}>
            {state.reason === "timeout" ? "It took too long. Check that location is on and try again." : state.reason === "unsupported" ? "Counter staff can issue you a walk-in token instead." : "Check that location is turned on for your device, then try again."}
          </EmptyState>
          <div className="mt-auto flex flex-col gap-2.5">
            {state.reason !== "unsupported" ? <Button icon="refresh" onClick={run}>Try again</Button> : null}
            <Button variant="link" onClick={() => setCounterHelp(true)}>Get a token at the counter</Button>
          </div>
        </>
      )}

      <Sheet open={counterHelp} onClose={() => setCounterHelp(false)} title="Get a token at the counter">
        <p className="mt-2 text-sm leading-relaxed text-muted">Counter staff can issue a walk-in token without your location. They will read the number out or print it. You do not need a phone.</p>
        <Button className="mt-4" onClick={() => setCounterHelp(false)}>Got it</Button>
      </Sheet>
      <p className="sr-only" aria-live="polite">{describe(state)}</p>
      <Link href={base} className="sr-only">Back to branch</Link>
    </FlowShell>
  );
}

function describe(s: LocationState): string {
  if (s.status === "checking") return "Checking your location";
  if (s.status === "ready") return s.result.status === "within" ? "You are at the branch" : s.result.status === "too_far" ? "You are too far to join" : "Your location is not precise enough";
  if (s.status === "failed") return "Location unavailable";
  return "";
}

function Privacy() {
  return (
    <div className="flex items-start gap-3 rounded-[18px] bg-surface p-3.5 shadow-[inset_0_0_0_1px_rgba(43,26,32,.06)]">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg"><Icon name="shield" size={17} /></span>
      <p className="text-[13px] leading-snug">
        <b className="block font-medium">Used twice, then forgotten</b>
        <span className="text-muted">Now, and once when you are nearly up. Never tracked in between.</span>
      </p>
    </div>
  );
}

function Blocked({ onRetry, onCounter }: { onRetry: () => void; onCounter: () => void }) {
  const steps = ["Tap the lock in the address bar", "Open Permissions, then Location", "Choose Allow, then come back here"];
  return (
    <>
      <h2 className="text-[22px] font-semibold tracking-[-.4px]">We need your location once</h2>
      <p className="text-sm leading-snug text-muted">Your browser is blocking it for this site, so we cannot tell you are at the branch.</p>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-3 border-b border-dashed border-line py-3 text-[14.5px] last:border-b-0">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-rose text-xs font-semibold text-deep">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-auto flex flex-col gap-2.5">
        <Button icon="refresh" onClick={onRetry}>Try again</Button>
        <Button variant="link" onClick={onCounter}>Get a token at the counter</Button>
      </div>
    </>
  );
}

