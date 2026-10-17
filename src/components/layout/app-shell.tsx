"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AuthGate } from "./auth-gate";
import { DesktopNav } from "./desktop-nav";
import { TabBar } from "./tab-bar";

/** Hide the tab bar on the focused screens (waiting, called, visit complete) on phones. */
const FOCUS_PREFIXES = ["/token/", "/visit/"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const focus = FOCUS_PREFIXES.some((p) => pathname.startsWith(p));
  return (
    <AuthGate>
      <div className="min-h-dvh lg:grid lg:grid-cols-[264px_1fr]">
        <DesktopNav />
        <div className={cn("min-w-0 pt-[var(--safe-top)]", focus ? "pb-[calc(24px+var(--safe-bottom))]" : "pb-[calc(92px+var(--safe-bottom))] lg:pb-10")}>
          <main className="mx-auto w-full max-w-[560px] px-[18px] md:max-w-[760px] md:px-8 lg:max-w-[1080px] lg:px-12 lg:pt-6">{children}</main>
        </div>
        {!focus ? <TabBar /> : null}
      </div>
    </AuthGate>
  );
}
