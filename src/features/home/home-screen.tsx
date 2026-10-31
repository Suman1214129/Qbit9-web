"use client";
import { useState } from "react";
import Link from "next/link";
import { Avatar, Badge, Button, EmptyState, Icon, Skeleton, type IconName } from "@/components/ui";
import { initialOf, tzParts, weekdayShort, formatClock, type BookingView, type TokenView } from "@/domain";
import { useActiveToken, useBookings, useSession } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { branchHref, lastBranch } from "@/lib/last-branch";
import { BookingSheet } from "@/features/booking/booking-sheet";

const TZ = "Asia/Kolkata";

function tokenLine(t: TokenView): { big: string; side: string; sideLabel: string; cta: string } {
  switch (t.stage) {
    case "checkin": return { big: t.code, side: String(t.ahead), sideLabel: "away", cta: "Check in" };
    case "called": return { big: t.code, side: String(t.counter ?? "-"), sideLabel: "counter", cta: "Go now" };
    case "serving": return { big: t.code, side: String(t.counter ?? "-"), sideLabel: "counter", cta: "View" };
    default: return { big: t.code, side: String(t.ahead), sideLabel: "ahead", cta: "Track" };
  }
}

/** Screen 16. Active token first, four plain actions, then what is coming up. */
export function HomeScreen() {
  const { data: session } = useSession();
  const { data: token, isPending: tokenPending } = useActiveToken(true);
  const { data: bookings } = useBookings(true);
  const last = lastBranch.use();
  const [open, setOpen] = useState<BookingView | null>(null);
  const first = session?.user.name?.split(" ")[0] ?? null;
  const upcoming = (bookings ?? []).filter((b) => b.status === "upcoming" || b.status === "checked_in").filter((b) => b.status === "upcoming");
  const joinHref = branchHref(last ? { bankSlug: last.bankSlug, branchSlug: last.branchSlug } : null);

  return (
    <div className="pb-4">
      <header className="flex items-center justify-between border-b border-ink pb-2 pt-2.5">
        <div>
          <small className="block text-xs text-muted">{last ? last.name : "Welcome back"}</small>
          <h1 className="text-[23px] font-medium tracking-[-.4px] md:text-[28px]">Hi, {first ?? "there"}</h1>
        </div>
        <Link href="/profile" aria-label="Profile"><Avatar initial={initialOf(session?.user.name)} size={36} /></Link>
      </header>

      <div className="grid gap-6 pt-4 lg:grid-cols-[1.15fr_1fr] lg:gap-10 lg:pt-6">
        <div className="flex flex-col gap-4">
          {tokenPending ? (
            <Skeleton className="h-[108px] rounded-[22px]" />
          ) : token ? (
            <ActiveCard token={token} />
          ) : (
            <div className="flex items-center gap-3 rounded-[22px] bg-rose p-4 text-deep">
              <div className="flex-1">
                <small className="text-xs text-deep/75">No active token</small>
                <b className="block text-[22px] leading-tight font-semibold tracking-[-.6px]">Skip the standing</b>
                <span className="text-[12.5px] text-deep/85">Join from the branch, wait anywhere.</span>
              </div>
              <Link href={joinHref} className="flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-on-primary">Get a token</Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Tile href={joinHref} icon="ticket" label="Get a token" tone="bg-rose" />
            <Tile href="/book" icon="cal" label="Book a visit" tone="bg-lavender" />
            <Tile href="/history" icon="hist" label="Past visits" tone="bg-peach" />
            <Tile href="/branches" icon="bank" label="Other branches" tone="bg-mustard/70" />
          </div>
        </div>

        <section aria-labelledby="up-h">
          <h2 id="up-h" className="flex items-center gap-2 border-b border-dashed border-line pb-3 text-[15px]">
            Upcoming {upcoming.length > 0 ? <Badge>{upcoming.length}</Badge> : null}
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState icon="cal" title="Nothing booked" action={<Button href="/book" variant="outline" size="sm" className="h-11">Book a visit</Button>}>
              Plan ahead and skip the line. Slots take under a minute.
            </EmptyState>
          ) : (
            <ul>
              {upcoming.map((b) => {
                const p = tzParts(b.startsAt, TZ);
                return (
                  <li key={b.id}>
                    <button type="button" onClick={() => setOpen(b)} className="flex w-full items-center gap-3 border-b border-dashed border-line py-2 text-left">
                      <span className="flex h-[50px] w-[46px] shrink-0 flex-col items-center justify-center rounded-[14px] bg-lavender text-[11px] leading-tight">
                        {weekdayShort(p.weekday)}
                        <b className="text-[19px] font-semibold">{p.day}</b>
                      </span>
                      <span className="flex-1 text-[14.5px] font-medium">
                        {b.serviceName}
                        <small className="mt-0.5 block text-xs font-normal text-muted">{formatClock(b.startsAt, TZ)}, {b.branchName.replace(" Branch", "")}{b.canCheckIn ? " · check in open" : ""}</small>
                      </span>
                      <Icon name="chev" size={16} className="text-muted" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <BookingSheet booking={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function ActiveCard({ token }: { token: TokenView }) {
  const line = tokenLine(token);
  return (
    <Link href={`/token/${token.code}`} className="flex items-center gap-3 rounded-[22px] bg-rose p-4 text-deep transition hover:brightness-[.98]">
      <div className="min-w-0 flex-1">
        <small className="text-xs text-deep/75">Active token</small>
        <b className="block text-[34px] leading-[1.05] font-semibold tracking-[-1.4px]">{line.big}</b>
        <span className="block truncate text-[12.5px] text-deep/85">{token.serviceName}, {token.branchName.replace(" Branch", "")}</span>
      </div>
      <div className="text-center text-xs text-deep/75">
        <b className="block text-[30px] font-semibold tracking-[-1px] text-deep">{line.side}</b>
        {line.sideLabel}
      </div>
      <span className="flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-medium text-on-primary">{line.cta}</span>
    </Link>
  );
}

function Tile({ href, icon, label, tone }: { href: string; icon: IconName; label: string; tone: string }) {
  return (
    <Link href={href} className={cn("flex h-[82px] flex-col justify-between rounded-[20px] p-3 transition active:scale-[.985] hover:brightness-[.98] md:h-[96px]", tone)}>
      <Icon name={icon} size={22} strokeWidth={1.5} />
      <span className="flex items-end justify-between">
        <b className="text-[15.5px] font-semibold">{label}</b>
        <span className="flex size-7 items-center justify-center rounded-full bg-white/70"><Icon name="arrow" size={14} /></span>
      </span>
    </Link>
  );
}
