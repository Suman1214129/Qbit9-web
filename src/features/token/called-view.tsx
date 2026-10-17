"use client";
import { useRouter } from "next/navigation";
import { FloorPlan, RingTimer } from "@/components/brand";
import { Button, Icon, InlineNote } from "@/components/ui";
import { Logo } from "@/components/brand";
import { type Branch, type TokenView } from "@/domain";
import { useTokenAction } from "@/hooks/mutations";
import { errorMessage } from "@/lib/errors";
import { formatCountdown } from "@/lib/format";
import { useSession } from "@/hooks/queries";

/** Screen 14. Full-screen, rose: the one moment the page must be impossible to miss. */
export function CalledView({ token, branch, now }: { token: TokenView; branch: Branch | null | undefined; now: number }) {
  const router = useRouter();
  const { data: session } = useSession();
  const onMyWay = useTokenAction("onMyWay");
  const more = useTokenAction("requestMoreTime");
  const deadline = token.callDeadline ?? now;
  const total = Math.max(1, deadline - (token.calledAt ?? now));
  const left = deadline - now;
  const first = session?.user.name?.split(" ")[0];
  const floor = branch?.counters.map((c) => c.number) ?? [];
  const error = onMyWay.error ?? more.error;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-rose pt-[var(--safe-top)] text-deep">
      <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col px-[18px] pb-[calc(24px+var(--safe-bottom))] md:px-8">
        <header className="flex items-center justify-between gap-3 border-b border-deep pb-[7px] pt-2.5">
          <button type="button" aria-label="Back to home" onClick={() => router.push("/home")} className="-ml-2 flex size-10 items-center justify-center"><Icon name="back" size={22} /></button>
          <h1 className="flex-1 text-[22px] font-medium tracking-[-.3px]">Token {token.code}</h1>
          <span className="hidden lg:block"><Logo size="sm" /></span>
        </header>

        <div className="grid flex-1 items-center gap-6 py-5 text-center lg:grid-cols-2 lg:gap-12">
          <div className="flex flex-col items-center gap-2">
            <h2 className="mt-0.5 text-[34px] leading-none font-semibold tracking-[-1.2px] lg:text-[44px]" aria-live="assertive">Your turn{first ? `, ${first}` : ""}</h2>
            <p className="text-[15px]">Please go to counter</p>
            <RingTimer remaining={left / total} size={176} caption="Counter" className="my-1 lg:scale-110"><span aria-label={`Counter ${token.counter ?? ""}`}>{token.counter ?? "-"}</span></RingTimer>
            <p className="flex items-center justify-center gap-[7px] text-sm" role="timer">
              <Icon name="clock" size={15} />
              <span className="tabular-nums">{formatCountdown(left)} left to reach it</span>
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="h-[112px] overflow-hidden rounded-card bg-surface lg:h-[190px]">
              <FloorPlan counters={floor} highlight={token.counter} path compact className="lg:hidden" />
              <FloorPlan counters={floor} highlight={token.counter} path className="hidden lg:block" />
            </div>
            {error ? <InlineNote tone="warn" icon="warn">{errorMessage(error)}</InlineNote> : null}
            <Button loading={onMyWay.isPending} disabled={token.onMyWay} icon={token.onMyWay ? "check" : "walk"} onClick={() => onMyWay.mutate(token.id)}>
              {token.onMyWay ? "On my way, counter told" : "I am on my way"}
            </Button>
            <Button variant="link" className="text-deep decoration-deep/45" loading={more.isPending} disabled={!token.canRequestMoreTime} onClick={() => more.mutate(token.id)}>
              {token.canRequestMoreTime ? "I need a few more minutes" : "Extra time used"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
