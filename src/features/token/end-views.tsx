"use client";
import { Button, EmptyState, Icon } from "@/components/ui";
import { type TokenView } from "@/domain";
import { BringList } from "./token-details";

export function ServingView({ token }: { token: TokenView }) {
  return (
    <div className="mx-auto grid max-w-[520px] gap-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-rose text-deep"><Icon name="user" size={26} /></span>
        <h2 className="text-[28px] leading-[1.05] font-semibold tracking-[-.9px]">You are being served</h2>
        <p className="text-[15px] text-muted">Counter {token.counter ?? "-"} has your token {token.code}. Your place in line is done.</p>
      </div>
      <div className="text-left"><BringList items={token.bring} title="Have these ready" /></div>
      <p className="text-xs text-muted">When the counter closes your visit, you will see a short thank you here.</p>
    </div>
  );
}

export function MissedView({ token, rejoinHref }: { token: TokenView; rejoinHref: string }) {
  const atCounter = token.calledAt != null;
  return (
    <div className="mx-auto max-w-[480px]">
      <EmptyState icon="clock" title="You missed your turn" action={<div className="flex flex-col gap-2.5"><Button href={rejoinHref}>Join the queue again</Button><Button href="/home" variant="outline">Back to home</Button></div>}>
        {atCounter ? `Token ${token.code} was closed because nobody reached counter ${token.counter ?? ""} in time.` : `Token ${token.code} was closed because we could not confirm you were at the branch.`} You can join again, but you will go to the back of the line.
      </EmptyState>
    </div>
  );
}

export function LeftView({ token, rejoinHref }: { token: TokenView; rejoinHref: string }) {
  return (
    <div className="mx-auto max-w-[480px]">
      <EmptyState icon="out" title="You left the queue" action={<div className="flex flex-col gap-2.5"><Button href={rejoinHref}>Join again</Button><Button href="/home" variant="outline">Back to home</Button></div>}>
        Token {token.code} is cancelled. Joining again puts you at the back of the line.
      </EmptyState>
    </div>
  );
}
