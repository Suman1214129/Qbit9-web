"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StampBadge } from "@/components/brand";
import { Button, Icon, Skeleton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSendFeedback } from "@/hooks/mutations";
import { useHistory, useSession, useToken } from "@/hooks/queries";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { formatMsAsMinutes } from "@/lib/format";
import { TopBar } from "@/components/layout";
import type { TokenFeedback } from "@/domain";
import { useState } from "react";
import { Sheet } from "@/components/ui";

const FEEDBACK: { value: TokenFeedback; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "okay", label: "Okay" },
  { value: "slow", label: "Slow" },
];

/** Screen 15: thanks, one tap of feedback, a stamp, and the one natural moment to suggest installing. */
export function VisitComplete({ code }: { code: string }) {
  const router = useRouter();
  const { data: token, isPending } = useToken(code);
  const { data: session } = useSession();
  const { data: history } = useHistory(!!session);
  const feedback = useSendFeedback();
  const install = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if (token && token.stage !== "served") router.replace(`/token/${token.code}`);
  }, [token, router]);

  if (isPending || !token || token.stage !== "served") return <div className="flex flex-col gap-4 pt-4" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-64" /></div>;

  const first = session?.user.name?.split(" ")[0];
  const visitsHere = history?.items.filter((i) => i.status === "served" && i.branchName === token.branchName).length ?? null;
  const chosen = feedback.variables?.feedback ?? token.feedback;
  const showInstall = !install.installed && (install.canPrompt || install.ios);

  return (
    <div className="pt-1">
      <TopBar title="Visit complete" back="/home" />
      <div className="mx-auto mt-6 flex max-w-[520px] flex-col items-center gap-2 text-center">
        <StampBadge label={`QUEUE-FREE VISIT · ${token.branchName.replace(" Branch", "").toUpperCase()} ·`} />
        <h2 className="mt-1 text-[24px] font-semibold tracking-[-.5px]">Thanks{first ? `, ${first}` : ""}</h2>
        <p className="text-[13.5px] text-muted">Token {token.code}, {token.serviceName.toLowerCase()}. It is saved in your history.</p>

        <dl className="mt-3 flex w-full justify-between gap-2 border-y border-dashed border-line py-4 text-left">
          <Stat label="Waited">{token.waitedMs != null ? formatMsAsMinutes(token.waitedMs) : "-"}</Stat>
          <Stat label="Saved, roughly">{token.savedMs ? formatMsAsMinutes(token.savedMs) : "-"}</Stat>
          <Stat label="Visits here">{visitsHere ?? "-"}</Stat>
        </dl>

        <fieldset className="mt-3 w-full">
          <legend className="mb-2 w-full text-center text-[15px] font-medium">How was it?</legend>
          <div className="flex justify-center gap-2" role="radiogroup" aria-label="How was it?">
            {FEEDBACK.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={chosen === f.value}
                disabled={feedback.isPending}
                onClick={() => feedback.mutate({ id: token.id, feedback: f.value })}
                className={cn("h-11 min-w-24 rounded-[14px] px-5 text-sm font-medium transition-colors", chosen === f.value ? "bg-primary text-on-primary" : "bg-surface shadow-[inset_0_0_0_1px_rgba(43,26,32,.12)] hover:bg-white")}
              >
                {f.label}
              </button>
            ))}
          </div>
          {chosen ? <p className="mt-2 text-xs text-muted" aria-live="polite">Thanks, that helps other customers see honest waits.</p> : null}
        </fieldset>

        {showInstall ? (
          <div className="mt-4 flex w-full items-center gap-3 rounded-[20px] bg-lavender p-4 text-left">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white"><Icon name="download" size={19} /></span>
            <div className="flex-1 text-sm font-medium">
              Add QBIT9 to your Home Screen
              <small className="block text-xs font-normal text-ink/70">Opens faster next time. iPhone needs it for alerts.</small>
            </div>
            <button type="button" onClick={() => (install.canPrompt ? void install.install() : setIosHelp(true))} className="text-[13px] font-semibold text-primary-strong underline underline-offset-2">Add</button>
          </div>
        ) : null}

        <Button href="/home" className="mt-4">Back to home</Button>
      </div>

      <Sheet open={iosHelp} onClose={() => setIosHelp(false)} title="Add to Home Screen">
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-snug">
          <li>Tap the Share button in Safari.</li>
          <li>Scroll and choose Add to Home Screen.</li>
          <li>Open QBIT9 from your Home Screen. Alerts work from there.</li>
        </ol>
        <Button className="mt-4" onClick={() => setIosHelp(false)}>Got it</Button>
      </Sheet>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 text-xs text-muted">
      <dt>{label}</dt>
      <dd className="mt-0.5 text-[17px] font-medium text-ink">{children}</dd>
    </div>
  );
}
