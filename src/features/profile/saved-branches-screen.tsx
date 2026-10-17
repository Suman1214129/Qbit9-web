"use client";
import { Button, EmptyState, Icon, Skeleton } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { useToggleSavedBranch } from "@/hooks/mutations";
import { useBranches, usePreferences, useSession, useSnapshots } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { BranchRow } from "@/features/branch/branch-row";

export function SavedBranchesScreen() {
  const { data: session } = useSession();
  const { data: prefs } = usePreferences(!!session);
  const { data: branches, isPending } = useBranches();
  const { data: snaps } = useSnapshots(branches?.map((b) => b.id) ?? []);
  const toggle = useToggleSavedBranch();
  const saved = new Set(prefs?.savedBranchIds ?? []);
  const sorted = [...(branches ?? [])].sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)));
  return (
    <div className="pb-4">
      <TopBar title="Saved branches" back="/profile" />
      <div className="mx-auto max-w-[640px] pt-2">
        {isPending ? <Skeleton className="mt-4 h-40" /> : saved.size === 0 ? (
          <EmptyState icon="bank" title="No saved branches yet" action={<Button href="/branches" variant="outline">Find a branch</Button>}>Star the branches you use so they are one tap away.</EmptyState>
        ) : null}
        {sorted.map((b) => (
          <div key={b.id} className="flex items-center">
            <div className="min-w-0 flex-1"><BranchRow branch={b} snapshot={snaps?.[b.id]} /></div>
            <button type="button" aria-pressed={saved.has(b.id)} aria-label={`${saved.has(b.id) ? "Remove" : "Save"} ${b.name}`} onClick={() => toggle.mutate(b.id)} className="ml-1 flex size-10 items-center justify-center rounded-full hover:bg-ink/[.05]">
              <Icon name="star" size={20} className={cn(saved.has(b.id) ? "fill-mustard text-mustard" : "text-muted")} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
