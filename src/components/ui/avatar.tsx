import { cn } from "@/lib/cn";

export function Avatar({ initial, size = 36, className }: { initial: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-rose font-semibold text-deep", className)}
    >
      {initial}
    </span>
  );
}

export function Monogram({ text, size = 46, className }: { text: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.32) }}
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-primary font-bold text-on-primary", className)}
    >
      {text}
    </span>
  );
}
