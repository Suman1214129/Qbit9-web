"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Icon, InlineNote, Switch } from "@/components/ui";
import { ContextPill, FlowShell } from "@/components/layout";
import { formatPhoneDigits, normalizePhone, validatePhone } from "@/domain";
import { useSession } from "@/hooks/queries";
import { useRequestOtp } from "@/hooks/mutations";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { lastBranch } from "@/lib/last-branch";
import { useJoinDraft } from "@/features/join/draft";
import { safeNext, setPendingSignIn } from "./challenge";
import { PrivacyNotice } from "./privacy-notice";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const draft = useJoinDraft();
  const last = lastBranch.use();
  const { data: session } = useSession();
  const request = useRequestOtp();

  const [phone, setPhone] = useState("");
  const [remember, setRemember] = useState(true);
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState(false);

  // A remembered customer never sees this screen.
  useEffect(() => {
    if (session) router.replace(next ?? (draft.branchId ? "/join/service" : "/home"));
  }, [session, router, next, draft.branchId]);

  const phoneCheck = validatePhone(phone);
  const valid = phoneCheck.ok;
  const error = touched && !valid ? phoneCheck.error : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    const identifier = normalizePhone(phone);
    try {
      const challenge = await request.mutateAsync({ channel: "phone", identifier });
      setPendingSignIn({ challenge, remember, next });
      router.push("/verify");
    } catch {
      /* shown below */
    }
  };

  const branchLabel = draft.branchName ?? (last ? last.name : null);
  const changeHref = draft.bankSlug && draft.branchSlug ? "/branches" : "/branches";

  return (
    <FlowShell
      step={2}
      title="Sign in"
      back={draft.bankSlug ? `/b/${draft.bankSlug}/${draft.branchSlug}/location` : "/branches"}
      branch={draft.branchName ? { bankName: draft.branchName.split(",")[0] ?? "", bankShort: "", branchName: draft.branchName } : null}
    >
      {branchLabel ? <ContextPill label={branchLabel} changeHref={changeHref} /> : null}
      <form onSubmit={submit} className="flex flex-1 flex-col gap-4" noValidate>
        <div>
          <h2 className="text-[19px] font-semibold">Enter your mobile number</h2>
          <p className="mt-1 text-sm text-muted">
            We will send a 4-digit code to this number. No password needed.
          </p>
        </div>

        <Field
          key="phone"
          label="Mobile number"
          prefix="+91"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          value={formatPhoneDigits(phone)}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          error={error}
          autoFocus
        />

        {env.adapter === "mock" ? <InlineNote icon="info">Demo mode: no SMS is sent. The code appears on the next screen.</InlineNote> : null}

        <label className="flex items-center gap-3 text-sm">
          <span className="flex-1">
            Keep me signed in on this device
            <small className="block text-xs text-muted">For 30 days. Log out any time from Profile.</small>
          </span>
          <Switch checked={remember} onChange={setRemember} label="Keep me signed in on this device" />
        </label>

        {request.isError ? <p role="alert" className="flex items-center gap-2 text-sm text-rust"><Icon name="warn" size={15} />{errorMessage(request.error)}</p> : null}

        <div className="mt-auto flex flex-col gap-3 pt-2">
          <p className="flex gap-2 text-xs leading-snug text-muted">
            <Icon name="lock" size={14} className="mt-px shrink-0" />
            <span>We use your mobile number only for tokens, alerts and visit history. <button type="button" onClick={() => setNotice(true)} className="text-primary-strong underline underline-offset-2">Read the notice</button>. You can withdraw consent any time.</span>
          </p>
          <Button type="submit" loading={request.isPending}>Send code</Button>
        </div>
      </form>
      <PrivacyNotice open={notice} onClose={() => setNotice(false)} />
    </FlowShell>
  );
}
