import type { IconName } from "@/components/ui";

export const NAV_ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/book", label: "Book", icon: "cal" },
  { href: "/history", label: "History", icon: "hist" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export const isActivePath = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
