import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui";

/** Page title row with the hairline underneath, as in the mockups. */
export function TopBar({ title, back, right, className, tone = "ink" }: { title: ReactNode; back?: string; right?: ReactNode; className?: string; tone?: "ink" | "deep" }) {
  return (
    <header className={cn("flex items-center justify-between gap-3 border-b pb-[7px] pt-2.5", tone === "deep" ? "border-deep" : "border-ink", className)}>
      {back ? (
        <Link href={back} aria-label="Back" className="-ml-2 flex size-10 items-center justify-center">
          <Icon name="back" size={22} />
        </Link>
      ) : null}
      <h1 className="flex-1 text-[22px] font-medium tracking-[-.3px] md:text-[26px]">{title}</h1>
      {right}
    </header>
  );
}
