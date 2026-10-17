import { cn } from "@/lib/cn";

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-[25px] w-[42px] shrink-0 rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary-strong" : "bg-ink/20")}
    >
      <span className={cn("absolute top-[3px] size-[19px] rounded-full bg-white shadow-sm transition-all", checked ? "left-[20px]" : "left-[3px]")} />
    </button>
  );
}
