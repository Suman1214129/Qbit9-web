"use client";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label: string;
  /** Fixed text before the value, e.g. "+91". */
  prefix?: string;
  trailing?: ReactNode;
  hint?: string;
  error?: string | null;
  action?: { label: string; onClick: () => void };
}

/** Underlined input from the mockups: small label above, large value, hairline below. */
export function Field({ label, prefix, trailing, hint, error, action, className, id, ...rest }: FieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  const hid = `${fid}-hint`;
  return (
    <div className={cn("group", className)}>
      <div className={cn("border-b pb-[7px] transition-colors", error ? "border-rust" : "border-ink/35 focus-within:border-primary-strong focus-within:border-b-2")}>
        <label htmlFor={fid} className="flex justify-between text-[11.5px] text-muted">
          {label}
          {action ? (
            <button type="button" onClick={action.onClick} className="font-medium text-primary-strong underline underline-offset-2">
              {action.label}
            </button>
          ) : null}
        </label>
        <div className="mt-[3px] flex items-center gap-2.5 text-[19px] font-medium tracking-[-.2px]">
          {prefix ? <span className="border-r border-line pr-2.5 font-normal text-muted">{prefix}</span> : null}
          <input
            id={fid}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? hid : undefined}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:font-normal placeholder:text-ink/30"
            {...rest}
          />
          {trailing}
        </div>
      </div>
      {error || hint ? (
        <p id={hid} role={error ? "alert" : undefined} className={cn("mt-1.5 text-xs", error ? "text-rust" : "text-muted")}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
