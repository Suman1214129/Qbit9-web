"use client";
import { useState } from "react";
import { FloorPlan } from "@/components/brand";
import { Button, Icon, Sheet } from "@/components/ui";
import { type Branch, type TokenView } from "@/domain";
import { env } from "@/lib/env";
import { formatUpdated, formatWaitRange, pluralize } from "@/lib/format";
import { AlertsAsk } from "./alerts-ask";
import { BringList, TokenSlipFor } from "./token-details";
import { useAlertSetup } from "./use-alert-setup";

/** Screen 12: nothing here needs the page to stay in front. */
export function WaitingView({ token, branch, now, onLeave }: { token: TokenView; branch: Branch | null | undefined; now: number; onLeave: () => void }) {
  const [slip, setSlip] = useState(false);
  const [ask, setAsk] = useState(false);
  const { enabled } = useAlertSetup();
  const counters = branch?.counters.filter((c) => c.groupIds.includes(token.groupId)).map((c) => c.number) ?? [];
  const floor = branch?.counters.map((c) => c.number) ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[112px] leading-[.82] font-semibold tracking-[-6px] text-primary-strong lg:text-[148px]" aria-hidden="true">{token.ahead}</p>
          <p className="mt-2 text-[22px] font-medium tracking-[-.3px]" aria-live="polite">
            <span className="sr-only">{token.ahead} </span>{pluralize(token.ahead, "person", "people")} ahead of you
          </p>
        </div>
        <dl className="flex gap-2.5">
          <Stat label="Now serving">{token.nowServingCode ?? "-"}</Stat>
          <Stat label="Estimated wait">{formatWaitRange(token.estWait)}</Stat>
          <Stat label="Updated">{formatUpdated(token.updatedAt, now)}</Stat>
        </dl>
        <div className="flex items-center gap-3 rounded-[18px] bg-peach p-3 text-[14.5px] font-medium leading-tight">
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-white"><Icon name={enabled ? "bell" : "bell-off"} size={17} /></span>
          <div className="flex-1">
            {enabled ? "Alerts are on" : "Alerts are off"}
            <small className="mt-0.5 block text-[12.5px] font-normal text-ink/70">
              {enabled ? (env.backgroundAlerts ? "Browser alert. You can close this page." : "Browser alert. Keep this tab open, it can sit in the background.") : "Turn them on to hear when you are 3 away."}
            </small>
          </div>
          {!enabled ? <button type="button" onClick={() => setAsk(true)} className="text-[13px] font-semibold text-primary-strong underline underline-offset-2">Turn on</button> : null}
        </div>
        <div className="hidden flex-col gap-2.5 lg:flex">
          <Button variant="danger" size="sm" onClick={onLeave} className="h-11">Leave the queue</Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative h-[172px] overflow-hidden rounded-card shadow-[inset_0_0_0_1px_rgba(43,26,32,.06)] lg:h-[260px]">
          <FloorPlan counters={floor.length ? floor : counters} highlight={token.counter} />
        </div>
        <p className="-mt-2 text-xs text-muted">
          {token.counter ? `Counter ${token.counter} is likely yours. Sit anywhere on the left.` : "We will tell you which counter when you are nearly up. Sit anywhere you are comfortable."}
        </p>
        <button type="button" onClick={() => setSlip(true)} className="flex items-center justify-between rounded-[18px] bg-surface px-4 py-3.5 text-left text-[14.5px] shadow-[inset_0_0_0_1px_rgba(43,26,32,.07)]">
          <span><b className="font-semibold">{token.code}</b><span className="ml-2 text-muted">{token.serviceName}</span></span>
          <span className="text-[13px] text-primary-strong underline underline-offset-2">Show token</span>
        </button>
        <div className="lg:hidden"><Button variant="link" onClick={onLeave} className="mx-auto">Leave the queue</Button></div>
      </div>

      <Sheet open={slip} onClose={() => setSlip(false)} title={`Token ${token.code}`}>
        <div className="mt-3 flex flex-col gap-5">
          <TokenSlipFor token={token} notch="bg-surface" />
          <BringList items={token.bring} />
          <Button onClick={() => setSlip(false)}>Close</Button>
        </div>
      </Sheet>
      <AlertsAsk open={ask} onClose={() => setAsk(false)} ahead={token.ahead} />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 text-[12.5px] text-muted">
      <dt>{label}</dt>
      <dd className="mt-px text-[17px] font-medium text-ink">{children}</dd>
    </div>
  );
}
