"use client";
import Link from "next/link";
import type { Branch, BranchSnapshot } from "@/domain";
import { Monogram } from "@/components/ui/avatar";
import { Chip, Icon } from "@/components/ui";
import { formatDistance } from "@/lib/format";

export function BranchRow({ branch, snapshot, distanceM, onPick }: { branch: Branch; snapshot?: BranchSnapshot; distanceM?: number | null; onPick?: () => void }) {
  return (
    <Link href={`/b/${branch.bank.slug}/${branch.slug}`} onClick={onPick} className="flex items-center gap-3.5 border-b border-dashed border-line py-3.5 transition-colors hover:bg-ink/[.025]">
      <Monogram text={branch.bank.shortName} bankSlug={branch.bank.slug} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15.5px] font-semibold">{branch.bank.shortName}, {branch.name.replace(" Branch", "")}</b>
        <span className="block truncate text-[12.5px] text-muted">
          {branch.area}
          {distanceM != null ? ` · ${formatDistance(distanceM)} away` : ""}
        </span>
      </span>
      {snapshot ? (
        snapshot.isOpen ? (
          <Chip tone="rose">{snapshot.waitingTotal} waiting</Chip>
        ) : (
          <Chip tone="off">Closed</Chip>
        )
      ) : null}
      <Icon name="chev" size={16} className="text-muted" />
    </Link>
  );
}
