import type { IconName } from "@/components/ui";

export const STAFF_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/staff/counter", label: "Counter", icon: "ticket" },
  { href: "/staff/queue", label: "Queue", icon: "list" },
  { href: "/staff/walk-in", label: "Walk-in", icon: "plus" },
  { href: "/staff/today", label: "Today", icon: "chart" },
];

export const isStaffActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
