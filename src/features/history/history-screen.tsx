"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Chip, EmptyState, Segmented, Skeleton, type ChipTone } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { formatClock, formatDayMonth, groupByMonth, relativeDayLabel, type BookingView, type HistoryItem } from "@/domain";
import { useBookings, useHistory } from "@/hooks/queries";
import { formatMinutes } from "@/lib/format";
import { BookingSheet } from "@/features/booking/booking-sheet";
import { clock } from "@/lib/clock";
import { Button } from "@/components/ui";

const TZ = "Asia/Kolkata";
type Filter = "all" | "tokens" | "booked";

const STATUS: Record<HistoryItem["status"], { label: string; tone: ChipTone }> = {
  served: { label: "Done", tone: "rose" },
  left: { label: "Left", tone: "off" },
  missed: { label: "Missed", tone: "off" },
  active: { label: "In progress", tone: "mustard" },
  upcoming: { label: "Upcoming", tone: "lavender" },
  cancelled: { label: "Cancelled", tone: "off" },
};

/** Screen 18. Stats on top, months with count badges, a status chip on every row. */
export function HistoryScreen() {
  const router = useRouter();
  const { data, isPending } = useHistory(true);
  const { data: bookings } = useBookings(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<BookingView | null>(null);

  const months = useMemo(() => {
    const items = (data?.items ?? []).filter((i) => filter === "all" || (filter === "tokens" ? i.kind === "token" : i.kind === "booking"));
    return groupByMonth(items, TZ);
  }, [data, filter]);

  const onRow = (i: HistoryItem) => {
    if (i.kind === "booking") return setOpen(bookings?.find((b) => b.id === i.refId) ?? null);
    router.push(i.status === "served" ? `/visit/${i.code}` : `/token/${i.code}`);
  };

  return (
    <div className="pb-4">
      <TopBar title="Your visits" />
      <div className="mx-auto max-w-[760px]">
        <dl className="grid grid-cols-3 gap-2.5 pt-4">
          <Stat label="Visits">{data ? data.stats.visits : "-"}</Stat>
          <Stat label="Average wait">{data?.stats.averageWaitMin != null ? formatMinutes(data.stats.averageWaitMin) : "-"}</Stat>
          <Stat label="Saved, roughly">{data && data.stats.savedMin > 0 ? formatMinutes(data.stats.savedMin) : "-"}</Stat>
        </dl>
        <div className="py-4"><Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "tokens", label: "Tokens" }, { value: "booked", label: "Booked" }]} /></div>

        {isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
        ) : months.length === 0 ? (
          <EmptyState icon="hist" title="No visits yet" action={<Button href="/home">Get a token</Button>}>Your tokens and bookings will show up here, with how long you waited.</EmptyState>
        ) : (
          months.map((m) => (
            <section key={m.key} aria-label={m.label}>
              <h2 className="flex items-center gap-2 border-b border-dashed border-line py-3 text-[15px]">{m.label} <Badge>{m.items.length}</Badge></h2>
              <ul>
                {m.items.map((i) => {
                  const st = STATUS[i.status];
                  const when = i.kind === "booking" ? `${relativeDayLabel(i.at, clock.now(), TZ) === "today" || relativeDayLabel(i.at, clock.now(), TZ) === "tomorrow" ? relativeDayLabel(i.at, clock.now(), TZ) : formatDayMonth(i.at, TZ)}, ${formatClock(i.at, TZ)}` : relativeDayLabel(i.at, clock.now(), TZ) === "today" ? "today" : formatDayMonth(i.at, TZ);
                  return (
                    <li key={i.id}>
                      <button type="button" onClick={() => onRow(i)} className="flex w-full items-center gap-2.5 border-b border-dashed border-line py-2.5 text-left transition-colors hover:bg-ink/[.025]">
                        <span className="flex-1 text-[14.5px] font-medium">
                          {i.title}
                          <small className="mt-0.5 block text-xs font-normal text-muted">{i.kind === "token" ? `Token ${i.code}` : "Booked"}, {i.branchName.replace(" Branch", "")}, {when}</small>
                        </span>
                        {i.status === "served" && i.waitedMin != null ? <Chip tone="rose">{formatMinutes(i.waitedMin)}</Chip> : <Chip tone={st.tone}>{st.label}</Chip>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
      <BookingSheet booking={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] bg-surface p-3 text-xs text-muted shadow-[inset_0_0_0_1px_rgba(43,26,32,.06)]">
      <dt>{label}</dt>
      <dd className="mt-1 text-[19px] font-semibold tracking-tight text-ink">{children}</dd>
    </div>
  );
}
