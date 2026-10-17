"use client";
import { Icon } from "@/components/ui";
import { TokenSlip } from "@/components/brand";
import { formatDayMonth, ordinal, type TokenView } from "@/domain";
import { formatWaitRange } from "@/lib/format";

const TZ = "Asia/Kolkata";

export function TokenSlipFor({ token, notch }: { token: TokenView; notch?: string }) {
  return (
    <TokenSlip
      code={token.code}
      service={token.serviceName}
      header={`${token.bankName.split(" ").map((w) => w[0]).join("").slice(0, 3)}, ${token.branchName}`}
      date={formatDayMonth(token.joinedAt, TZ)}
      notch={notch}
      stats={[
        { label: "In line", value: token.stage === "waiting" || token.stage === "checkin" ? ordinal(token.position) : token.stage === "called" ? "Called" : "Now" },
        { label: "Usual wait", value: formatWaitRange(token.usualWait) },
        { label: "Counter", value: token.counter ?? "Any" },
      ]}
    />
  );
}

export function BringList({ items, title = "Bring with you" }: { items: string[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="bring-h">
      <h2 id="bring-h" className="flex items-center gap-2 text-[15px] font-medium">
        {title}
        <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary-strong px-[5px] text-[11px] font-semibold text-white">{items.length}</span>
      </h2>
      <ul className="mt-1">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-2.5 border-b border-dashed border-line py-[9px] text-sm last:border-b-0">
            <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full text-primary-strong shadow-[inset_0_0_0_1.3px_var(--color-primary-strong)]">
              <Icon name="check" size={11} strokeWidth={2.6} />
            </span>
            {it}
          </li>
        ))}
      </ul>
    </section>
  );
}
