"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { BranchArt, Logo } from "@/components/brand";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { FLOW_STEPS, Stepper } from "./stepper";
import { TopBar } from "./top-bar";

export interface FlowBranch {
  bankName: string;
  bankShort: string;
  branchName: string;
}

interface Props {
  /** 1 to 4 for the numbered steps, 0 for the landing page (no stepper). */
  step: number;
  title: string;
  back?: string;
  branch?: FlowBranch | null;
  children: ReactNode;
  /** Landing page shows the illustration on top of the form column on phones. */
  hero?: boolean;
}

/**
 * Pre-token screens. Phones: one column with a stepper. Desktop: a calm split, branch and steps on
 * the left, the single task on the right.
 */
export function FlowShell({ step, title, back, branch, children, hero }: Props) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(400px,5fr)_7fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-rose/70 p-10 lg:flex">
        <Link href="/" aria-label="QBIT9 home"><Logo /></Link>
        <div className="flex flex-col gap-8">
          <div className="h-[230px] overflow-hidden rounded-sheet shadow-card"><BranchArt /></div>
          <div>
            <p className="text-sm text-deep/70">{branch ? branch.bankName : "Smart queues for banks"}</p>
            <h2 className="mt-1 text-[34px] leading-[1.05] font-semibold tracking-[-1px] text-deep">{branch ? branch.branchName : "Skip the standing."}</h2>
          </div>
          {step > 0 ? (
            <ol className="flex flex-col gap-3.5" aria-label="Steps">
              {FLOW_STEPS.map((s, i) => {
                const n = i + 1;
                const done = n < step;
                const on = n === step;
                return (
                  <li key={s} aria-current={on ? "step" : undefined} className={cn("flex items-center gap-3 text-[15px]", on ? "font-semibold text-deep" : done ? "text-deep/80" : "text-deep/50")}>
                    <span className={cn("flex size-7 items-center justify-center rounded-full text-[13px]", done ? "bg-primary text-on-primary" : on ? "bg-deep text-on-primary" : "bg-deep/10")}>
                      {done ? <Icon name="check" size={14} strokeWidth={3} /> : n}
                    </span>
                    {s}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="max-w-[34ch] text-[15px] leading-snug text-deep/80">Join the line from your phone. Wait wherever is comfortable. We tell you when it is nearly your turn.</p>
          )}
        </div>
        <p className="flex items-center gap-2 text-xs text-deep/70">
          <Icon name="shield" size={14} /> We check your location once to join and once when you are nearly up. Never in between.
        </p>
      </aside>

      <div className="flex min-h-dvh justify-center pt-[var(--safe-top)] lg:items-center lg:bg-bg">
        <div className={cn("flex w-full max-w-[480px] flex-col px-[18px] pb-[calc(24px+var(--safe-bottom))] md:px-0 lg:max-w-[460px]", hero ? "pt-0" : "pt-1")}>
          {step > 0 ? <Stepper step={step} className="mt-3 lg:mt-0" /> : null}
          {hero ? (
            <div className="-mx-[18px] mt-0 h-[170px] overflow-hidden rounded-b-[28px] md:mx-0 md:mt-6 md:rounded-[28px] lg:hidden">
              <BranchArt />
            </div>
          ) : (
            <TopBar title={title} back={back} className="mt-2.5 lg:mt-0" />
          )}
          <div className="flex flex-1 flex-col gap-3 pt-3.5 lg:pt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Small "SBI, Main Road Branch · Change" pill shown under the title on sign-in and service screens. */
export function ContextPill({ label, changeHref }: { label: string; changeHref?: string }) {
  return (
    <div className="flex self-start rounded-full bg-surface py-[7px] pr-3 pl-2.5 text-[13px] font-medium shadow-[inset_0_0_0_1px_rgba(43,26,32,.08)]">
      <span className="flex items-center gap-[7px]">
        <Icon name="bank" size={15} />
        {label}
        {changeHref ? <Link href={changeHref} className="ml-1.5 font-normal text-primary-strong underline underline-offset-2">Change</Link> : null}
      </span>
    </div>
  );
}
