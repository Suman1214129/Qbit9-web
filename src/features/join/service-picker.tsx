"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Chip, EmptyState, Icon, Skeleton } from "@/components/ui";
import { ContextPill, FlowShell } from "@/components/layout";
import { waitMid, type ServiceGroupLive, type ServiceLive } from "@/domain";
import { useCatalogue, useSnapshot } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { formatWaitShort } from "@/lib/format";
import { setDraft } from "./draft";
import { useJoinGuard } from "./use-join-guard";

type Filter = "all" | "quick";

/** Screen 8. Services grouped like the branch's own signage, with the wait next to each name. */
export function ServicePicker() {
  const router = useRouter();
  const { ready, draft } = useJoinGuard();
  const { data: catalogue, isPending } = useCatalogue(draft.branchId);
  const { data: snap } = useSnapshot(draft.branchId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!catalogue) return [] as ServiceGroupLive[];
    return catalogue
      .map((g) => ({
        ...g,
        services: g.services.filter((s) => (!q || s.name.toLowerCase().includes(q) || g.name.toLowerCase().includes(q)) && (filter === "all" || waitMid(s.usualWait) < 10)),
      }))
      .filter((g) => g.services.length > 0);
  }, [catalogue, q, filter]);

  const selected = catalogue?.flatMap((g) => g.services).find((s) => s.id === draft.serviceId) ?? null;
  const filtering = q !== "" || filter !== "all";
  const expanded = (id: string, index: number) => manual[id] ?? (filtering ? true : selected ? selected.groupId === id : index === 0);
  const toggle = (id: string, index: number) => setManual((m) => ({ ...m, [id]: !expanded(id, index) }));

  const pick = (s: ServiceLive) => setDraft({ serviceId: s.id, serviceName: s.name });

  return (
    <FlowShell
      step={3}
      title="Choose a service"
      back={draft.bankSlug ? `/b/${draft.bankSlug}/${draft.branchSlug}` : "/branches"}
      branch={draft.branchName ? { bankName: draft.branchName.split(",")[0] ?? "", bankShort: "", branchName: draft.branchName } : null}
    >
      {draft.branchName ? <ContextPill label={draft.branchName} changeHref="/branches" /> : null}
      {selected ? (
        <div className="flex">
          <Chip tone="mustard" icon="check">{selected.name}, {formatWaitShort(selected.usualWait)}</Chip>
        </div>
      ) : null}

      <label className="flex items-center gap-2 border-b border-ink/30 pb-[7px] text-[13px] text-muted focus-within:border-primary-strong">
        <Icon name="search" size={14} />
        <span className="sr-only">Search services</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search services" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
      </label>

      <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5 text-[12.5px]">
        {([["all", "All"], ["quick", "Quick, under 10 min"]] as const).map(([v, label]) => (
          <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={cn("rounded-chip px-2.5 py-1.5 transition-colors", filter === v ? "bg-rose font-medium" : "bg-surface shadow-[inset_0_0_0_1px_rgba(43,26,32,.1)] hover:bg-white")}>
            {label}
          </button>
        ))}
      </div>

      {!ready || isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : groups.length === 0 ? (
        <EmptyState icon="search" title="No services match">Try a different word, or clear the filter.</EmptyState>
      ) : (
        <div role="radiogroup" aria-label="Services" className="flex flex-col">
          {groups.map((g, gi) => {
            const isOpen = expanded(g.id, gi);
            return (
              <section key={g.id}>
                <button type="button" aria-expanded={isOpen} aria-controls={`grp-${g.id}`} onClick={() => toggle(g.id, gi)} className="flex w-full items-center gap-2 border-b border-dashed border-line py-3 text-left text-[15px]">
                  {g.name}
                  <Badge>{g.services.length}</Badge>
                  <Icon name="chev" size={19} strokeWidth={1.3} className={cn("ml-auto text-muted transition-transform", isOpen && "rotate-90")} />
                </button>
                {isOpen ? (
                  <ul id={`grp-${g.id}`} className="py-1">
                    {g.services.map((s) => {
                      const on = s.id === draft.serviceId;
                      return (
                        <li key={s.id}>
                          <button type="button" role="radio" aria-checked={on} onClick={() => pick(s)} className={cn("-mx-1 flex w-[calc(100%+8px)] items-center rounded-xl px-2 py-[9px] text-left text-[14.5px] transition-colors", on ? "bg-rose/45" : "hover:bg-ink/[.03]")}>
                            <span className="flex-1">
                              {s.name}
                              <small className="ml-1.5 text-[11.5px] text-muted">{formatWaitShort(s.usualWait)}</small>
                            </span>
                            <span className="mr-2 text-[12.5px] text-muted">{s.waiting} waiting</span>
                            <span className={cn("flex size-5 items-center justify-center rounded-full", on ? "bg-primary text-on-primary" : "shadow-[inset_0_0_0_1.5px_rgba(43,26,32,.25)]")}>
                              {on ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {snap && !snap.isOpen ? <p className="rounded-2xl bg-peach px-3.5 py-3 text-[13px]">This branch is closed right now, so tokens are paused.</p> : null}

      <div className="mt-auto pt-3">
        <Button disabled={!selected || (snap ? !snap.isOpen : false)} onClick={() => router.push("/join/review")} iconRight="arrow">
          Continue{selected ? <Badge className="ml-1 bg-white/25">1</Badge> : null}
        </Button>
      </div>
    </FlowShell>
  );
}
