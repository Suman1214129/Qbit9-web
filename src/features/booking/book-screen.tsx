"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Chip, EmptyState, Icon, InlineNote, Sheet, Skeleton } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { formatSlotFull, type BookingView, type Slot } from "@/domain";
import { useCreateBooking } from "@/hooks/mutations";
import { useAvailability, useBranches, useCatalogue } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { formatWaitShort } from "@/lib/format";
import { lastBranch } from "@/lib/last-branch";
import { BranchRow } from "@/features/branch/branch-row";
import { BringList } from "@/features/token/token-details";
import { addToCalendar } from "./booking-sheet";

const TZ = "Asia/Kolkata";

/** Screen 17. Closed and full slots stay visible but dashed, so people see why they cannot pick them. */
export function BookScreen() {
  const params = useSearchParams();
  const { data: branches } = useBranches();
  const last = lastBranch.use();
  const [chosenBranch, setBranchId] = useState<string | null>(params.get("branch"));
  const [chosenService, setServiceId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [pick, setPick] = useState<"branch" | "service" | null>(null);
  const [done, setDone] = useState<BookingView | null>(null);
  const create = useCreateBooking();

  const branchId = chosenBranch ?? last?.id ?? branches?.[0]?.id ?? null;

  const branch = branches?.find((b) => b.id === branchId) ?? null;
  const { data: catalogue } = useCatalogue(branchId);
  const bookable = useMemo(() => (catalogue ?? []).map((g) => ({ ...g, services: g.services.filter((s) => s.bookable) })).filter((g) => g.services.length), [catalogue]);
  const allBookable = bookable.flatMap((g) => g.services);
  const service = allBookable.find((s) => s.id === chosenService) ?? bookable.find((g) => g.id === "grp_loans")?.services[0] ?? allBookable[0] ?? null;
  const serviceId = service?.id ?? null;

  const { data: days, isPending: loadingDays, error: daysError } = useAvailability(branchId, service?.id);
  const day = days?.find((d) => d.date === date) ?? days?.find((d) => d.open) ?? days?.[0] ?? null;
  const picked: Slot | null = day?.slots.find((s) => s.startsAt === slot && s.status === "free") ?? null;

  const submit = async () => {
    if (!branchId || !service || !picked) return;
    try {
      setDone(await create.mutateAsync({ branchId, serviceId: service.id, startsAt: picked.startsAt }));
      setSlot(null);
    } catch {
      setSlot(null);
    }
  };

  const reminder = env.featureSms ? "Reminder by alert and SMS an hour before." : "Reminder by alert an hour before.";

  return (
    <div className="pb-4">
      <TopBar title="Book a visit" />
      <div className="grid gap-6 pt-4 lg:grid-cols-[1fr_1.2fr] lg:gap-12 lg:pt-6">
        <div className="flex flex-col gap-3">
          <Selector label="Service" value={service ? `${service.name}, ${formatWaitShort({ minMin: service.avgServiceMin, maxMin: service.avgServiceMin })}` : "Choose a service"} icon="list" onClick={() => setPick("service")} />
          <Selector label="Branch" value={branch ? `${branch.bank.shortName}, ${branch.name.replace(" Branch", "")}` : "Choose a branch"} icon="bank" onClick={() => setPick("branch")} />
          {service ? <div className="hidden lg:block"><BringList items={service.bring} title="What to bring" /></div> : null}
        </div>

        <div className="flex flex-col gap-4">
          {loadingDays || !days ? (
            daysError ? <InlineNote tone="warn">{errorMessage(daysError)}</InlineNote> : <div className="flex flex-col gap-3" aria-busy="true"><Skeleton className="h-16" /><Skeleton className="h-40" /></div>
          ) : (
            <>
              <div role="radiogroup" aria-label="Day" className="no-scrollbar flex gap-[7px] overflow-x-auto">
                {days.map((d) => {
                  const on = day?.date === d.date;
                  return (
                    <button key={d.date} type="button" role="radio" aria-checked={on} disabled={!d.open} onClick={() => { setDate(d.date); setSlot(null); }} className={cn("min-w-[52px] flex-1 rounded-2xl py-[9px] text-center text-[11.5px] transition-colors", on ? "bg-primary text-on-primary" : d.open ? "bg-surface text-muted hover:bg-white" : "border border-dashed border-ink/35 text-muted opacity-65")}>
                      {d.weekday}
                      <b className={cn("mt-px block text-[19px] font-semibold", on ? "text-white" : "text-ink")}>{d.dayOfMonth}</b>
                      {!d.open ? <span className="block text-[10px]">closed</span> : null}
                    </button>
                  );
                })}
              </div>

              {day && day.slots.length > 0 ? (
                (["morning", "afternoon"] as const).map((part) => {
                  const list = day.slots.filter((s) => s.part === part);
                  if (!list.length) return null;
                  return (
                    <section key={part} aria-label={part}>
                      <h3 className="mb-2 text-[13px] font-medium capitalize text-muted">{part}</h3>
                      <div role="radiogroup" aria-label={`${part} slots`} className="grid grid-cols-3 gap-2 md:grid-cols-4">
                        {list.map((s) => {
                          const on = s.startsAt === slot;
                          const off = s.status !== "free";
                          return (
                            <button key={s.startsAt} type="button" role="radio" aria-checked={on} aria-disabled={off} disabled={off} onClick={() => setSlot(s.startsAt)} title={s.status === "full" ? "Fully booked" : s.status === "past" ? "Too soon to book" : undefined} className={cn("flex h-[42px] items-center justify-center rounded-[13px] text-sm font-medium tabular-nums transition-colors", on ? "bg-rose shadow-[inset_0_0_0_1.5px_var(--color-primary)]" : off ? "border border-dashed border-ink/30 text-ink/35 line-through" : "bg-surface hover:bg-white")}>
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              ) : (
                <EmptyState icon="cal" title="Closed this day">Pick another day. Banks close on Sundays and the 2nd and 4th Saturdays.</EmptyState>
              )}
            </>
          )}

          {create.isError ? <InlineNote tone="warn" icon="warn">{errorMessage(create.error)}</InlineNote> : null}

          {picked ? (
            <div className="flex items-center gap-3 rounded-[18px] bg-surface p-3.5 shadow-[inset_0_0_0_1px_rgba(43,26,32,.06)]">
              <Icon name="cal" size={20} className="shrink-0 text-primary-strong" />
              <p className="text-[13.5px] leading-snug">
                <b className="block text-[15px]">{formatSlotFull(picked.startsAt, TZ)}</b>
                <span className="text-muted">{reminder} We hold your slot for 15 minutes.</span>
              </p>
            </div>
          ) : null}
          <Button disabled={!picked} loading={create.isPending} onClick={submit}>Confirm booking</Button>
        </div>
      </div>

      <Sheet open={pick === "branch"} onClose={() => setPick(null)} title="Choose a branch">
        <div className="mt-2 max-h-[60dvh] overflow-y-auto">
          {(branches ?? []).map((b) => (
            <div key={b.id} onClickCapture={(e) => { e.preventDefault(); setBranchId(b.id); setServiceId(null); setDate(null); setSlot(null); setPick(null); }}>
              <BranchRow branch={b} />
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={pick === "service"} onClose={() => setPick(null)} title="Choose a service">
        <div className="mt-2 max-h-[60dvh] overflow-y-auto">
          {bookable.map((g) => (
            <section key={g.id} className="mb-3">
              <h3 className="border-b border-dashed border-line py-2 text-[13px] text-muted">{g.name}</h3>
              {g.services.map((s) => (
                <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setSlot(null); setPick(null); }} className={cn("-mx-1 flex w-[calc(100%+8px)] items-center justify-between rounded-xl px-2 py-2.5 text-left text-[14.5px]", s.id === serviceId ? "bg-rose/45" : "hover:bg-ink/[.03]")}>
                  {s.name}
                  <Chip tone="lavender">{s.avgServiceMin} min</Chip>
                </button>
              ))}
            </section>
          ))}
        </div>
      </Sheet>

      <Sheet open={!!done} onClose={() => setDone(null)} title="You are booked">
        {done ? (
          <div className="mt-3 flex flex-col gap-4">
            <p className="text-sm text-muted">{done.serviceName} at {done.branchName}.</p>
            <p className="text-[22px] font-semibold tracking-[-.4px]">{formatSlotFull(done.startsAt, TZ)}</p>
            <InlineNote icon="clock">Check in from the branch from 30 minutes before. {reminder}</InlineNote>
            <BringList items={done.bring} />
            <Button icon="download" variant="outline" onClick={() => addToCalendar(done, branch?.address)}>Add to calendar</Button>
            <Button href="/home" onClick={() => setDone(null)}>Done</Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

function Selector({ label, value, icon, onClick }: { label: string; value: string; icon: "list" | "bank"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-[18px] bg-surface p-3.5 text-left shadow-[inset_0_0_0_1px_rgba(43,26,32,.06)] transition-colors hover:bg-white">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg"><Icon name={icon} size={17} /></span>
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug"><small className="block text-xs text-muted">{label}</small><b className="block truncate font-medium">{value}</b></span>
      <Icon name="chev" size={16} className="text-muted" />
    </button>
  );
}
