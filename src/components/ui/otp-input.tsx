"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface Props {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}

/**
 * One real input drawn as underlined boxes. A single input (not four) keeps paste, password
 * managers, SMS autofill (`autocomplete=one-time-code`) and screen readers working.
 */
export function OtpInput({ length = 4, value, onChange, onComplete, error, disabled, autoFocus = true, label = "Verification code" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const set = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="mt-1.5 flex gap-3" aria-hidden="true">
        {Array.from({ length }, (_, i) => {
          const ch = value[i];
          const current = focused && i === Math.min(value.length, length - 1);
          return (
            <span
              key={i}
              className={cn(
                "flex h-11 flex-1 items-center justify-center border-b-[1.5px] text-[26px] font-medium",
                error ? "border-rust" : current ? "border-b-[2.5px] border-primary-strong" : "border-ink/35",
              )}
            >
              {ch ?? (current ? <span className="h-[26px] w-[1.5px] animate-fade-in bg-primary-strong" /> : null)}
            </span>
          );
        })}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => set(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        disabled={disabled}
        aria-label={label}
        aria-invalid={error || undefined}
        className="absolute inset-0 size-full cursor-text opacity-0"
      />
    </div>
  );
}
