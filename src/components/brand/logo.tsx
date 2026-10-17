import { cn } from "@/lib/cn";

export function Logo({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "size-7 text-[11px] rounded-lg" : "size-9 text-[13px] rounded-[11px]";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden="true" className={cn("flex items-center justify-center bg-primary font-bold tracking-tight text-on-primary", box)}>
        Q9
      </span>
      <span className={cn("font-semibold tracking-[-.4px]", size === "sm" ? "text-base" : "text-[19px]")}>QBIT9</span>
    </span>
  );
}
