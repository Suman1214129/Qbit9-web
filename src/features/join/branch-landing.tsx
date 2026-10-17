"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button, Chip, EmptyState, Skeleton } from "@/components/ui";
import { Monogram } from "@/components/ui/avatar";
import { FlowShell } from "@/components/layout";
import { useBranch, useSnapshot } from "@/hooks/queries";
import { formatWaitShort } from "@/lib/format";
import { lastBranch } from "@/lib/last-branch";
import { clearDraft, setDraft } from "./draft";

/** Screen 1. The QR code on the branch wall points here. */
export function BranchLanding({ bank, slug }: { bank: string; slug: string }) {
  const { data: branch, isPending } = useBranch(bank, slug);
  const { data: snap } = useSnapshot(branch?.id);

  useEffect(() => {
    if (!branch) return;
    lastBranch.set({ id: branch.id, bankSlug: branch.bank.slug, branchSlug: branch.slug, name: branch.name });
    clearDraft();
    setDraft({ branchId: branch.id, bankSlug: branch.bank.slug, branchSlug: branch.slug, branchName: `${branch.bank.shortName}, ${branch.name.replace(" Branch", "")}` });
  }, [branch]);

  if (isPending) {
    return (
      <FlowShell step={0} title="" hero>
        <Skeleton className="h-44" /><Skeleton className="h-24" />
      </FlowShell>
    );
  }
  if (!branch) {
    return (
      <FlowShell step={0} title="Branch not found">
        <EmptyState icon="pin" title="We could not find that branch" action={<Button href="/branches">Find your branch</Button>}>
          The link or QR code may be old. Pick your branch from the list.
        </EmptyState>
      </FlowShell>
    );
  }

  const open = snap?.isOpen ?? true;
  const base = `/b/${branch.bank.slug}/${branch.slug}`;
  const usual = snap ? (snap.usualWaitMin > 0 ? formatWaitShort({ minMin: snap.usualWaitMin, maxMin: snap.usualWaitMin }) : "No wait") : null;

  return (
    <FlowShell step={0} title={branch.name} branch={{ bankName: branch.bank.name, bankShort: branch.bank.shortName, branchName: branch.name }} hero>
      <section className="rounded-card bg-surface p-4 shadow-card lg:shadow-none lg:bg-transparent lg:p-0">
        <div className="flex items-center gap-3">
          <Monogram text={branch.bank.shortName} size={52} className="rounded-[16px]" />
          <div>
            <p className="text-xs text-muted">{branch.bank.name}</p>
            <h1 className="text-[23px] leading-tight font-semibold tracking-[-.5px]">{branch.name}</h1>
          </div>
        </div>
        <div className="mt-3.5 border-t border-dashed border-line pt-3" />
        {snap ? (
          <dl className="flex justify-between gap-2" aria-label="Branch right now">
            <Stat label="Waiting">{open ? snap.waitingTotal : "-"}</Stat>
            <Stat label="Usual wait">{open ? usual : "-"}</Stat>
            <Stat label={open ? "Open until" : "Opens"}>{open ? (snap.closesLabel ?? "-") : (snap.opensLabel ?? "-")}</Stat>
          </dl>
        ) : (
          <Skeleton className="h-12" />
        )}
      </section>

      {open ? (
        <>
          <div className="mt-1">
            <h2 className="text-[17px] font-semibold">Share your location to join</h2>
            <p className="mt-1 text-sm leading-snug text-muted">We check once that you are at the branch, so queues stay honest. We do not track you afterwards.</p>
          </div>
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            <Button href={`${base}/location?auto=1`} icon="pin">Share location and join</Button>
            <Button href={`/book?branch=${branch.id}`} variant="outline" size="sm" className="h-12">Book a visit for later</Button>
            <Link href="/branches" className="pt-1 text-center text-sm text-muted underline underline-offset-[3px]">Not your branch?</Link>
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 flex items-start gap-3 rounded-[18px] bg-peach p-3.5 text-sm">
            <Chip tone="off" className="shrink-0">Closed</Chip>
            <p className="leading-snug">This branch is closed right now{snap?.opensLabel ? `. It opens ${snap.opensLabel}` : ""}. You can still book a visit.</p>
          </div>
          <div className="mt-auto flex flex-col gap-2.5 pt-3">
            <Button href={`/book?branch=${branch.id}`} icon="cal">Book a visit</Button>
            <Link href="/branches" className="pt-1 text-center text-sm text-muted underline underline-offset-[3px]">Not your branch?</Link>
          </div>
        </>
      )}
    </FlowShell>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1">
      <dt className="text-[12.5px] text-muted">{label}</dt>
      <dd className="text-[17px] font-medium">{children}</dd>
    </div>
  );
}
