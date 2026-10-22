"use client";
import { useState } from "react";
import { Button, Field, Icon, Skeleton, useToast } from "@/components/ui";
import { PRIORITY_TAGS, formatPhoneDigits, validateName, validatePhone, type PriorityTag } from "@/domain";
import { useIssueWalkIn } from "@/hooks/staff/mutations";
import { useWalkInServices } from "@/hooks/staff/queries";
import { errorMessage } from "@/lib/errors";
import { formatWaitRange, pluralize } from "@/lib/format";
import type { WalkInResult } from "@/services/staff-types";
import { Choice } from "./entry-bits";
import { PRIORITY_LABEL } from "./staff-format";
import { StaffMenu } from "./staff-shell";

/** Screen S7: issue a token for someone standing at the counter. Name and phone are optional. */
export function WalkInScreen() {
  const toast = useToast();
  const { data: groups, isPending } = useWalkInServices();
  const issue = useIssueWalkIn();
  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [priority, setPriority] = useState<PriorityTag[]>([]);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<WalkInResult | null>(null);

  const nameCheck = validateName(name);
  const phoneCheck = digits ? validatePhone(digits) : { ok: true as const, value: "" };
  const nameError = !nameCheck.ok ? nameCheck.error : null;
  const phoneError = digits && !phoneCheck.ok ? phoneCheck.error : null;

  const reset = () => { setName(""); setDigits(""); setServiceId(null); setPriority([]); setTouched(false); setResult(null); };

  const submit = async () => {
    setTouched(true);
    if (!serviceId || nameError || phoneError) return;
    try {
      setResult(await issue.mutateAsync({ name, phone: digits, serviceId, priority }));
    } catch (e) {
      toast.show({ title: "Could not issue the token", body: errorMessage(e), tone: "warn" });
    }
  };

  if (result) return <IssuedCard result={result} onAnother={reset} />;

  return (
    <div className="flex flex-col gap-5 pt-3 lg:pt-0">
      <header className="flex items-end justify-between gap-3 border-b border-ink pb-2">
        <div>
          <small className="text-[13px] text-muted">For someone at the counter</small>
          <h1 className="text-[26px] leading-tight font-medium tracking-[-.5px] md:text-[30px]">Walk-in</h1>
        </div>
        <div className="pb-1"><StaffMenu /></div>
      </header>

      <form className="grid gap-6 lg:grid-cols-2 lg:gap-12" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="flex flex-col gap-5">
          <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" autoComplete="off" error={touched ? nameError : null} />
          <Field
            label="Mobile number (optional)"
            prefix="+91"
            inputMode="numeric"
            value={formatPhoneDigits(digits)}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="98765 43210"
            autoComplete="off"
            error={touched ? phoneError : null}
            hint="Only used to message them about this token."
          />
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Priority, if they qualify</legend>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_TAGS.map((p) => (
                <Choice key={p} on={priority.includes(p)} onClick={() => setPriority((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}>{PRIORITY_LABEL[p].toLowerCase()}</Choice>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-5">
          <fieldset aria-describedby={touched && !serviceId ? "svc-err" : undefined}>
            <legend className="mb-2 text-sm font-medium">What do they need?</legend>
            {isPending || !groups ? <Skeleton className="h-32" /> : (
              <div className="flex flex-col gap-4">
                {groups.map((g) => (
                  <div key={g.groupId}>
                    <span className="mb-1.5 block text-xs text-muted">{g.groupName}</span>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={g.groupName}>
                      {g.services.map((s) => <Choice key={s.id} radio on={serviceId === s.id} onClick={() => setServiceId(s.id)}>{s.name.toLowerCase()}</Choice>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {touched && !serviceId ? <p id="svc-err" role="alert" className="mt-2 text-xs text-rust">Pick what the customer needs.</p> : null}
          </fieldset>
          <Button size="xl" type="submit" loading={issue.isPending} icon="ticket">Issue token</Button>
        </div>
      </form>
    </div>
  );
}

function IssuedCard({ result, onAnother }: { result: WalkInResult; onAnother: () => void }) {
  const toast = useToast();
  const { entry, ahead, estWait } = result;
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 pt-6">
      <section aria-label="Token issued" className="rounded-card bg-rose px-5 py-8 text-center">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-deep/75"><Icon name="check" size={14} strokeWidth={2.4} /> Token issued</span>
        <b className="block text-[72px] leading-[1.05] font-medium tracking-[-3px] text-deep">{entry.code}</b>
        <p className="mt-1 text-[16px] text-deep">{entry.serviceName}{entry.name ? `, ${entry.name}` : ""}</p>
      </section>
      <div className="rounded-[18px] bg-surface p-4 text-[14.5px] shadow-card">
        <b className="block font-medium">{ahead === 0 ? "Nobody ahead" : `${ahead} ${pluralize(ahead, "person", "people")} ahead`}</b>
        <span className="text-muted">Expected wait {formatWaitRange(estWait)}. Tell them to sit down, the counter will call the number.</span>
      </div>
      <Button variant="outline" icon="share" onClick={async () => {
        try { await navigator.clipboard.writeText(entry.code); toast.show({ title: `Copied ${entry.code}` }); } catch { toast.show({ title: "Could not copy", tone: "warn" }); }
      }}>Copy token number</Button>
      <Button onClick={onAnother} icon="plus">Add another</Button>
    </div>
  );
}
