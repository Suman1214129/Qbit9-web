"use client";
import { useMemo, useState } from "react";
import { Button, EmptyState, Icon, InlineNote, Skeleton } from "@/components/ui";
import { FlowShell } from "@/components/layout";
import { distanceM, type LocationProof } from "@/domain";
import { useBranches, useSnapshots } from "@/hooks/queries";
import { GeoError, readPosition } from "@/lib/geolocation";
import { BranchRow } from "./branch-row";

/** Find a branch by name or area, or sort by distance. The QR code on the wall skips this screen. */
export function BranchPicker() {
  const { data: branches, isPending } = useBranches();
  const { data: snaps } = useSnapshots(branches?.map((b) => b.id) ?? []);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<LocationProof | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (branches ?? [])
      .filter((b) => !q || `${b.bank.name} ${b.bank.shortName} ${b.name} ${b.area} ${b.city}`.toLowerCase().includes(q))
      .map((b) => ({ b, d: pos ? distanceM(pos, b.location) : null }));
    return pos ? list.sort((x, y) => (x.d ?? 0) - (y.d ?? 0)) : list;
  }, [branches, query, pos]);

  const nearMe = async () => {
    setLocating(true);
    setGeoError(null);
    try {
      setPos(await readPosition());
    } catch (e) {
      setGeoError(e instanceof GeoError && e.reason === "denied" ? "Location is blocked for this site, so we cannot sort by distance." : "We could not get your location. Search by name instead.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <FlowShell step={0} title="Find your branch" back="/">
      <label className="flex items-center gap-2 border-b border-ink/30 pb-[7px] text-[13px] text-muted focus-within:border-primary-strong">
        <Icon name="search" size={14} />
        <span className="sr-only">Search branches</span>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by bank, branch or area" className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
      </label>
      <Button variant="outline" size="sm" icon="pin" loading={locating} onClick={nearMe} className="h-11" block>{pos ? "Sorted by distance" : "Show nearest first"}</Button>
      {geoError ? <InlineNote tone="warn">{geoError}</InlineNote> : null}
      {isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon="bank" title="No branches match">Try the area name, or a different bank.</EmptyState>
      ) : (
        <div>{rows.map(({ b, d }) => <BranchRow key={b.id} branch={b} snapshot={snaps?.[b.id]} distanceM={d} />)}</div>
      )}
      <p className="pt-2 text-center text-xs text-muted">Scanning the QR code at the branch takes you straight to its queue.</p>
    </FlowShell>
  );
}
