import { cn } from "@/lib/cn";

export const FLOW_STEPS = ["Location", "Sign in", "Service", "Review"] as const;

/** Thin progress bar: one segment per step, filled up to and including the current one. */
export function Stepper({ step, className }: { step: number; className?: string }) {
  return (
    <div role="img" aria-label={`Step ${step} of ${FLOW_STEPS.length}: ${FLOW_STEPS[step - 1] ?? ""}`} className={cn("flex gap-[5px]", className)}>
      {FLOW_STEPS.map((s, i) => (
        <i key={s} className={cn("h-[3px] flex-1 rounded-[3px]", i < step ? "bg-primary" : "bg-ink/12")} />
      ))}
    </div>
  );
}
