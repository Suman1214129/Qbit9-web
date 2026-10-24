"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Icon, InlineNote, OtpInput } from "@/components/ui";
import { FlowShell } from "@/components/layout";
import { OTP_LENGTH } from "@/domain";
import { useVerifyOtp, useRequestOtp } from "@/hooks/mutations";
import { useSession } from "@/hooks/queries";
import { useNow } from "@/hooks/use-now";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { formatCountdown } from "@/lib/format";
import { useJoinDraft } from "@/features/join/draft";
import { safeNext, setPendingSignIn, usePendingSignIn } from "./challenge";

export function VerifyForm() {
  const router = useRouter();
  const pending = usePendingSignIn();
  const draft = useJoinDraft();
  const { data: session } = useSession();
  const verify = useVerifyOtp();
  const resend = useRequestOtp();
  const now = useNow(1000);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [wrong, setWrong] = useState(false);
  const submitted = useRef(false);

  const destination = safeNext(pending?.next) ?? (draft.branchId ? "/join/service" : "/home");

  // Nothing pending (direct visit or refresh after success): start over from sign in.
  useEffect(() => {
    if (session) router.replace(destination);
    else if (!pending) router.replace("/sign-in");
  }, [session, pending, router, destination]);

  const submit = useCallback(
    async (value: string) => {
      if (!pending || verify.isPending) return;
      setWrong(false);
      try {
        await verify.mutateAsync({ channel: pending.challenge.channel, identifier: pending.challenge.identifier, code: value, name: name || null, remember: pending.remember });
        setPendingSignIn(null);
        router.replace(destination);
      } catch {
        setWrong(true);
        setCode("");
        submitted.current = false;
      }
    },
    [pending, verify, name, router, destination],
  );

  // WebOTP: lets Chrome on Android read the SMS code when a real SMS provider is switched on.
  useEffect(() => {
    if (!pending || pending.challenge.channel !== "phone" || !env.featureSms) return;
    const ac = new AbortController();
    const creds = navigator.credentials as unknown as { get?: (o: unknown) => Promise<{ code?: string } | null> };
    creds?.get?.({ otp: { transport: ["sms"] }, signal: ac.signal })?.then((o) => o?.code && setCode(o.code.slice(0, OTP_LENGTH)), () => {});
    return () => ac.abort();
  }, [pending]);

  if (!pending) return <FlowShell step={2} title="Verify"><div aria-busy="true" /></FlowShell>;
  const c = pending.challenge;
  const secondsLeft = Math.max(0, c.resendAvailableAt - now);
  const needsName = c.needsName;

  const onComplete = (v: string) => {
    if (!needsName && !submitted.current) {
      submitted.current = true;
      void submit(v);
    }
  };

  const doResend = async () => {
    try {
      const next = await resend.mutateAsync({ channel: c.channel, identifier: c.identifier });
      setPendingSignIn({ ...pending, challenge: next });
      setCode("");
      setWrong(false);
    } catch {
      /* surfaced below */
    }
  };

  return (
    <FlowShell step={2} title="Verify" back="/sign-in">
      <div>
        <h2 className="text-[19px] font-semibold">Enter the code</h2>
        <p className="mt-1 text-sm text-muted">
          Sent to {c.sentTo}.{" "}
          <button type="button" onClick={() => { setPendingSignIn(null); router.push("/sign-in"); }} className="text-primary-strong underline underline-offset-2">
            Change number
          </button>
        </p>
      </div>

      <div>
        <div className="flex justify-between text-[11.5px] text-muted">
          <span>{OTP_LENGTH}-digit code</span>
          {secondsLeft > 0 ? <span aria-live="off">Resend in {formatCountdown(secondsLeft)}</span> : (
            <button type="button" onClick={doResend} disabled={resend.isPending} className="font-medium text-primary-strong underline underline-offset-2">Resend code</button>
          )}
        </div>
        <OtpInput value={code} onChange={(v) => { setCode(v); if (wrong) setWrong(false); }} onComplete={onComplete} error={wrong} disabled={verify.isPending} length={OTP_LENGTH} />
        {wrong || verify.isError ? <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-rust"><Icon name="warn" size={15} />{errorMessage(verify.error)}</p> : null}
        {c.debugCode ? (
          <button type="button" onClick={() => { setCode(c.debugCode as string); onComplete(c.debugCode as string); }} className="mt-3 rounded-chip bg-mustard/40 px-2.5 py-1.5 text-xs">
            Demo mode: your code is <b className="font-mono tracking-widest">{c.debugCode}</b>. Tap to fill.
          </button>
        ) : env.featureSms && c.channel === "phone" ? (
          <p className="mt-3 text-xs text-muted">If your browser allows it, the code fills in by itself.</p>
        ) : null}
      </div>

      {needsName ? (
        <div className="mt-2">
          <Field label="What should we call you? Optional" placeholder="Your first name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} hint="Staff use it when calling you. Asked only the first time." maxLength={40} />
        </div>
      ) : null}

      {resend.isError ? <InlineNote tone="warn">{errorMessage(resend.error)}</InlineNote> : null}

      <div className="mt-auto pt-3">
        <Button disabled={code.length !== OTP_LENGTH} loading={verify.isPending} onClick={() => submit(code)}>Verify and continue</Button>
      </div>
    </FlowShell>
  );
}
