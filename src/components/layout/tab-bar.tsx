"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isActivePath, NAV_ITEMS } from "./nav-items";

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex justify-around bg-surface px-3 pt-2 pb-[calc(10px+var(--safe-bottom))] shadow-[0_-1px_0_rgba(43,26,32,.07)] lg:hidden">
      {NAV_ITEMS.map((item) => {
        const on = isActivePath(pathname, item.href);
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
