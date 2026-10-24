"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Avatar, Button, Chip, Icon, IconButton, Monogram, Sheet, Skeleton } from "@/components/ui";
import { useRoster, useStaffSession } from "@/hooks/staff/queries";
import { useStaffSignOut } from "@/hooks/staff/mutations";
import { useStaffSync } from "@/hooks/staff/use-staff-sync";
import { cn } from "@/lib/cn";
import { clearLeaving, isLeaving, markLeaving } from "@/lib/leaving";
import { STAFF_NAV, isStaffActive } from "./staff-nav";

/** Signed in staff only. Everyone else goes to the staff sign in and comes back here afterwards. */
export function StaffShell({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useStaffSession();
  const router = useRouter();
  const pathname = usePathname();
  useStaffSync(!!session);

  useEffect(() => {
    if (session) clearLeaving();
    else if (!isPending && !isLeaving()) router.replace(`/staff/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [isPending, session, router, pathname]);

  if (isPending || !session) {
    return (
      <div className="flex flex-col gap-4 px-[18px] pt-6" aria-busy="true">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
      <Sidebar />
      <div className="min-w-0 pt-[var(--safe-top)] pb-[calc(92px+var(--safe-bottom))] lg:pb-10">
        <main className="mx-auto w-full max-w-[560px] px-[18px] md:max-w-[760px] md:px-8 lg:max-w-[1120px] lg:px-12 lg:pt-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useStaffSession();
  const { data: roster } = useRoster(!!session);
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-ink/8 bg-surface px-5 py-7 lg:flex">
      <div className="px-2">
        <Logo />
        {roster?.branch ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-ink/[.03] p-2">
            <Monogram text={roster.branch.bankShort} size={28} className="rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{roster.branch.bankName}</p>
              <p className="truncate text-[11px] text-muted">{roster.branch.name}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">Counter staff</p>
        )}
      </div>
      <nav aria-label="Staff" className="flex flex-col gap-1">
        {STAFF_NAV.map((item) => {
          const on = isStaffActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition-colors", on ? "bg-rose font-semibold text-ink" : "text-muted hover:bg-ink/[.04] hover:text-ink")}>
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {session ? (
          <div className="flex items-center gap-3 rounded-[20px] bg-rose/60 p-3.5">
            <Avatar initial={session.staff.name.slice(0, 1)} size={38} className="bg-white" />
            <div className="min-w-0 text-[13px] leading-snug">
              <b className="block truncate text-[14.5px]">{session.staff.name}</b>
              <span className="block truncate text-muted">
                {roster ? `${roster.branch.bankShort}, ${roster.branch.name.replace(" Branch", "")}` : session.staff.employeeId}
                {roster?.shift.counter != null && (roster.shift.status === "open" || roster.shift.status === "break") ? `, Counter ${roster.shift.counter}` : ""}
              </span>
            </div>
          </div>
        ) : null}
        <SignOutButton />
      </div>
    </aside>
  );
}

function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Staff" className="fixed inset-x-0 bottom-0 z-30 flex justify-around bg-surface px-3 pt-2 pb-[calc(10px+var(--safe-bottom))] shadow-[0_-1px_0_rgba(43,26,32,.07)] lg:hidden">
      {STAFF_NAV.map((item) => {
        const on = isStaffActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn("flex flex-col items-center gap-[3px] text-[11.5px]", on ? "font-semibold text-ink" : "text-muted")}>
            <i className={cn("flex h-[30px] w-[54px] items-center justify-center rounded-[15px] transition-colors", on && "bg-rose")}>
              <Icon name={item.icon} size={21} />
            </i>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton({ onDone }: { onDone?: () => void }) {
  const signOut = useStaffSignOut();
  const router = useRouter();
  return (
    <Button
      variant="outline"
      icon="out"
      size="sm"
      loading={signOut.isPending}
      onClick={async () => {
        markLeaving();
        await signOut.mutateAsync();
        onDone?.();
        router.replace("/staff/sign-in");
      }}
    >
      Sign out
    </Button>
  );
}

/** Kebab in a page header: who is signed in, and sign out. Phones have no sidebar to hold it. */
export function StaffMenu() {
  const [open, setOpen] = useState(false);
  const { data: session } = useStaffSession();
  return (
    <>
      <IconButton icon="kebab" label="Staff menu" className="shadow-none lg:hidden" onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title="Your account">
        <div className="mt-3 flex flex-col gap-4">
          {session ? (
            <div className="flex items-center gap-3">
              <Avatar initial={session.staff.name.slice(0, 1)} size={44} />
              <div className="text-sm">
                <b className="block text-base">{session.staff.name}</b>
                <span className="text-muted">Employee ID {session.staff.employeeId}</span>
              </div>
            </div>
          ) : null}
          <SignOutButton onDone={() => setOpen(false)} />
        </div>
      </Sheet>
    </>
  );
}

/** The Open / On break chip from the mockups. */
export function ShiftChip({ status }: { status: "open" | "break" | "idle" | "ended" }) {
  if (status === "open") return <Chip tone="ok" className="gap-1.5 py-1.5"><span className="size-1.5 rounded-full bg-ok" />Open</Chip>;
  if (status === "break") return <Chip tone="mustard" className="gap-1.5 py-1.5"><span className="size-1.5 rounded-full bg-ink/60" />On break</Chip>;
  return <Chip tone="off">Off shift</Chip>;
}
