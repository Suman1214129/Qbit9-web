"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Icon } from "@/components/ui";
import { Logo } from "@/components/brand";
import { useActiveToken, useSession } from "@/hooks/queries";
import { cn } from "@/lib/cn";
import { branchHref, lastBranch } from "@/lib/last-branch";
import { isActivePath, NAV_ITEMS } from "./nav-items";

export function DesktopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { data: token } = useActiveToken(!!session);
  const last = lastBranch.use();
  const live = token && (token.stage === "waiting" || token.stage === "checkin" || token.stage === "called" || token.stage === "serving");

  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-ink/8 bg-surface px-5 py-7 lg:flex">
      <Link href="/home" className="px-2"><Logo /></Link>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const on = isActivePath(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} aria-current={on ? "page" : undefined} className={cn("flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition-colors", on ? "bg-rose font-semibold text-ink" : "text-muted hover:bg-ink/[.04] hover:text-ink")}>
              <Icon name={item.icon} size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {live ? (
          <Link href={`/token/${token.code}`} className="block rounded-[20px] bg-rose p-4 text-deep transition hover:brightness-[.98]">
            <span className="text-xs text-deep/75">Active token</span>
            <b className="block text-[28px] leading-tight font-semibold tracking-[-1px]">{token.code}</b>
            <span className="text-[13px]">{token.stage === "called" ? `Go to counter ${token.counter ?? ""}` : token.stage === "serving" ? "Being served" : `${token.ahead} ahead`}</span>
          </Link>
        ) : (
          <Button href={branchHref(last ? { bankSlug: last.bankSlug, branchSlug: last.branchSlug } : null)} icon="ticket">Get a token</Button>
        )}
        {session ? (
          <p className="truncate px-2 text-xs text-muted">Signed in as {session.user.name ?? session.user.phone ?? session.user.email}</p>
        ) : null}
      </div>
    </aside>
  );
}
