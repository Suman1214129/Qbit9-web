"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BranchArt, Logo } from "@/components/brand";
import { Button, Field, Icon, InlineNote } from "@/components/ui";
import { isDomainError, validateEmployeeId, validatePin, STAFF_POLICY } from "@/domain";
import { useStaffSignIn } from "@/hooks/staff/mutations";
import { useStaffSession } from "@/hooks/staff/queries";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import { useServices } from "@/providers/services-provider";

/** Only same-site staff paths are allowed as a return target, so the sign in cannot bounce anyone elsewhere. */
const safeNext = (v: string | null) => (v && v.startsWith("/staff/") && !v.startsWith("/staff/sign-in") ? v : "/staff/start");

/** Screen S1. No sign up: the branch admin creates accounts. */
export function StaffSignInScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { staff } = useServices();
  const { data: session } = useStaffSession();
  const signIn = useStaffSignIn();
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<{ field: "id" | "pin" | "form"; message: string } | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pinRef = useRef<HTMLInputElement>(null);
  const next = safeNext(params.get("next"));

  useEffect(() => {
    if (session) router.replace(next);
  }, [session, router, next]);

  useEffect(() => {
    if (lockedUntil == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const locked = lockedUntil != null && lockedUntil > now;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    const id = validateEmployeeId(employeeId);
    if (!id.ok) return setError({ field: "id", message: id.error });
    const p = validatePin(pin);
    if (!p.ok) return setError({ field: "pin", message: p.error });
    try {
      await signIn.mutateAsync({ employeeId: id.value, pin });
      router.replace(next);
    } catch (err) {
      setPin("");
      if (isDomainError(err) && err.code === "account_locked") {
        const wait = Number(err.details?.retryAfterMs ?? STAFF_POLICY.lockoutMs);
        setLockedUntil(Date.now() + wait);
        setNow(Date.now());
      }
      setError({ field: "form", message: errorMessage(err) });
      pinRef.current?.focus();
    }
  };

  const caps = staff.capabilities();
  const lockLeft = locked ? Math.ceil(((lockedUntil as number) - now) / 1000) : 0;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(400px,5fr)_7fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-rose/70 p-10 lg:flex">
        <Link href="/" aria-label="QBIT9 home"><Logo /></Link>
        <div className="flex flex-col gap-8">
          <div className="h-[230px] overflow-hidden rounded-sheet bg-transparent"><BranchArt /></div>
          <div>
            <p className="text-sm text-deep/70">Counter staff</p>
            <h2 className="mt-1 text-[34px] leading-[1.05] font-semibold tracking-[-1px] text-deep">One job: call the next person.</h2>
          </div>
          <p className="max-w-[36ch] text-[15px] leading-snug text-deep/80">The system decides the order. You call, serve, and move on. Nothing to close, nothing to forget.</p>
        </div>
        <p className="flex items-center gap-2 text-xs text-deep/70"><Icon name="shield" size={14} /> Accounts are made by your branch admin.</p>
      </aside>

      <div className="flex min-h-dvh justify-center pt-[var(--safe-top)] lg:items-center lg:bg-bg">
        <form onSubmit={submit} noValidate className="flex w-full max-w-[480px] flex-col gap-5 px-[18px] pt-4 pb-[calc(24px+var(--safe-bottom))] md:px-0 lg:max-w-[460px] lg:pt-0">
          <header className="border-b border-ink pb-[7px]">
            <h1 className="text-[22px] font-medium tracking-[-.3px] md:text-[26px]">Staff sign in</h1>
          </header>
          <div>
            <h2 className="text-[30px] leading-[1.05] font-semibold tracking-[-1px]">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted">Use your employee ID and PIN.</p>
          </div>

          <Field
            label="Employee ID"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
            autoComplete="username"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={6}
            placeholder="E48213"
            error={error?.field === "id" ? error.message : null}
            autoFocus
          />

          <PinField value={pin} onChange={setPin} inputRef={pinRef} error={error?.field === "pin" ? error.message : null} onEnter={() => void submit()} />

          {error?.field === "form" ? <InlineNote icon="warn" tone="warn">{locked ? `${error.message} Try again in ${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, "0")}.` : error.message}</InlineNote> : null}


          <div className="flex flex-col gap-3">
            <Button type="submit" loading={signIn.isPending} disabled={locked || !employeeId || pin.length < STAFF_POLICY.pinMinLength}>Sign in</Button>
            {caps.passkey ? (
              <>
                <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 border-t border-dashed border-line" />or<span className="h-px flex-1 border-t border-dashed border-line" /></div>
                <Button variant="outline" icon="key">Use passkey</Button>
              </>
            ) : null}
          </div>
          <p className="text-center text-[12.5px] leading-snug text-muted">Accounts are made by your branch admin. Forgot your PIN? Ask them to reset it.</p>
        </form>
      </div>
    </div>
  );
}

/** Masked PIN as underlined boxes. One real password input underneath, so password managers and screen readers work. */
function PinField({ value, onChange, error, inputRef, onEnter }: { value: string; onChange: (v: string) => void; error: string | null; inputRef: React.RefObject<HTMLInputElement | null>; onEnter: () => void }) {
  const [focused, setFocused] = useState(false);
  const boxes = STAFF_POLICY.pinMinLength; // 4 digits
  return (
    <div>
      <label htmlFor="staff-pin" className="text-[11.5px] text-muted">PIN</label>
      <div className="relative" onClick={() => inputRef.current?.focus()}>
        <div className="mt-1.5 flex gap-2.5" aria-hidden="true">
          {Array.from({ length: boxes }, (_, i) => {
            const filled = i < value.length;
            const current = focused && i === Math.min(value.length, boxes - 1);
            return (
              <span key={i} className={cn("flex h-12 flex-1 items-center justify-center rounded-[14px] bg-surface text-[26px] shadow-[inset_0_0_0_1px_rgba(43,26,32,.12)]", error ? "shadow-[inset_0_0_0_1.5px_var(--color-rust)]" : current && "shadow-[inset_0_0_0_2px_var(--color-primary-strong)]")}>
                {filled ? "•" : null}
              </span>
            );
          })}
        </div>
        <input
          id="staff-pin"
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          pattern="[0-9]*"
          maxLength={boxes}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, boxes))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "staff-pin-error" : undefined}
          className="absolute inset-0 size-full cursor-text opacity-0"
        />
      </div>
      <p id="staff-pin-error" role={error ? "alert" : undefined} className={cn("mt-1.5 text-xs", error ? "text-rust" : "text-muted")}>{error ?? "4-digit PIN"}</p>
    </div>
  );
}
