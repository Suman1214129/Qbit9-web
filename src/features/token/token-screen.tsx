"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, EmptyState, Sheet, Skeleton } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { isDomainError } from "@/domain";
import { useTokenAction } from "@/hooks/mutations";
import { useBranchById, useToken } from "@/hooks/queries";
import { useNow } from "@/hooks/use-now";
import { errorMessage } from "@/lib/errors";
import { CalledView } from "./called-view";
import { CheckinView } from "./checkin-view";
import { LeftView, MissedView, ServingView } from "./end-views";
import { WaitingView } from "./waiting-view";
import { WelcomeView } from "./welcome-view";

/** One URL per token. The stage decides which screen shows, so refreshing or reopening always lands in the right place. */
export function TokenScreen({ code }: { code: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: token, error, isPending } = useToken(code);
  const { data: branch } = useBranchById(token?.branchId);
  const now = useNow(1000);
  const leave = useTokenAction("leave");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [welcomed, setWelcomed] = useState(false);

  const isNew = params.get("new") === "1" && !welcomed;

  useEffect(() => {
    if (token?.stage === "served") router.replace(`/visit/${token.code}`);
  }, [token?.stage, token?.code, router]);

  if (isPending) return <div className="flex flex-col gap-4 pt-4" aria-busy="true"><Skeleton className="h-10" /><Skeleton className="h-48" /><Skeleton className="h-24" /></div>;
  if (error || !token) {
    return (
      <div className="pt-4">
        <TopBar title="Token" back="/home" />
        <EmptyState icon="ticket" title="We could not find that token" action={<Button href="/home">Back to home</Button>}>
          {error && !isDomainError(error) ? errorMessage(error) : "It may belong to another account, or it was removed."}
        </EmptyState>
      </div>
    );
  }

  if (token.stage === "called") return <CalledView token={token} branch={branch} now={now} />;

  const rejoin = `/b/${token.bankSlug}/${token.branchSlug}`;
  const finishWelcome = () => {
    setWelcomed(true);
    router.replace(`/token/${token.code}`);
  };
  const title = token.stage === "checkin" ? `Token ${token.code}` : token.stage === "missed" ? "Token closed" : token.stage === "left" ? "Token cancelled" : `Token ${token.code}`;

  return (
    <div className="pt-1 lg:pt-0">
      <TopBar title={isNew && token.stage === "waiting" ? "Your token" : title} back="/home" />
      <div className="pt-4 lg:pt-8">
        {token.stage === "waiting" && isNew ? <WelcomeView token={token} onContinue={finishWelcome} /> : null}
        {token.stage === "waiting" && !isNew ? <WaitingView token={token} branch={branch} now={now} onLeave={() => setConfirmLeave(true)} /> : null}
        {token.stage === "checkin" ? <CheckinView token={token} branch={branch} now={now} /> : null}
        {token.stage === "serving" ? <ServingView token={token} /> : null}
        {token.stage === "missed" ? <MissedView token={token} rejoinHref={rejoin} /> : null}
        {token.stage === "left" ? <LeftView token={token} rejoinHref={rejoin} /> : null}
      </div>

      <Sheet open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave the queue?" variant="dialog">
        <p className="mt-2 text-sm leading-snug text-muted">You will lose your place. You can join again, but you will go to the back of the line.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => setConfirmLeave(false)} className="h-11 flex-1 rounded-xl bg-bg font-medium">Stay</button>
          <button
            type="button"
            disabled={leave.isPending}
            onClick={async () => {
              await leave.mutateAsync(token.id).catch(() => {});
              setConfirmLeave(false);
            }}
            className="h-11 flex-1 rounded-xl bg-rust font-medium text-white disabled:opacity-60"
          >
            Leave
          </button>
        </div>
      </Sheet>
    </div>
  );
}
