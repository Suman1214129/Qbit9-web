"use client";
import { useState } from "react";
import { Button, Icon, InlineNote, Sheet, useToast } from "@/components/ui";
import { STAFF_POLICY, type QueueEntry } from "@/domain";
import { useSetNote, useTransfer } from "@/hooks/staff/mutations";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/errors";
import type { CounterState } from "@/services/staff-types";
import { customerName, minutesSince } from "./staff-format";

/** The current customer has not reached the counter. Staff choose: wait, or close them as a no-show. */
export function NotArrivedSheet({ open, onClose, current, next, now, busy, onNoShow }: {
  open: boolean; onClose: () => void; current: QueueEntry; next: QueueEntry | null; now: number; busy: boolean; onNoShow: () => void;
}) {
  const ago = current.calledAt != null ? minutesSince(current.calledAt, now) : 0;
  return (
    <Sheet open={open} onClose={onClose} title={`${current.code} has not reached your counter`}>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-[14.5px] leading-snug text-muted">
          {customerName(current)} was called {ago < 1 ? "just now" : `${ago} min ago`} and {current.replied ? "said they are on the way" : "has not replied"}.
          Marking them as a no-show closes their token. They can be called again from Today if they turn up.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button variant="danger" loading={busy} onClick={onNoShow}>{next ? `Mark no-show and call ${next.code}` : "Mark as no-show"}</Button>
          <Button variant="outline" onClick={onClose}>Keep waiting</Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Send the customer to another counter that takes the same service and has nobody at it. */
export function TransferSheet({ open, onClose, state }: { open: boolean; onClose: () => void; state: CounterState }) {
  const transfer = useTransfer();
  const toast = useToast();
  const cur = state.current;
  const targets = state.transferTargets;
  return (
    <Sheet open={open} onClose={onClose} title="Transfer to another counter">
      <div className="mt-3 flex flex-col gap-3">
        {!cur ? null : targets.length === 0 ? (
          <InlineNote icon="info">No other counter that takes {cur.serviceName.toLowerCase()} is open right now. Ask a colleague to start their shift, or keep serving.</InlineNote>
        ) : (
          <>
            <p className="text-[14px] leading-snug text-muted">{cur.code} will be called again at the counter you pick.</p>
            <ul className="flex flex-col">
              {targets.map((t) => (
                <li key={t.number}>
                  <button
                    type="button"
                    disabled={t.busy || transfer.isPending}
                    onClick={async () => {
                      try {
                        await transfer.mutateAsync(t.number);
                        toast.show({ title: `Sent to Counter ${t.number}`, tone: "success", ms: 2200 });
                        onClose();
                      } catch (e) {
                        toast.show({ title: "Could not transfer", body: errorMessage(e), tone: "warn" });
                      }
                    }}
                    className="flex w-full items-center gap-3 border-b border-dashed border-line py-3 text-left transition-colors hover:bg-ink/[.025] disabled:opacity-55"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-rose text-lg font-semibold text-deep">{t.number}</span>
                    <span className="flex-1">
                      <span className="block text-[15px] font-medium">Counter {t.number}</span>
                      <span className="block text-[12.5px] text-muted">{t.takenBy}</span>
                    </span>
                    <span className={cn("text-xs", t.busy ? "text-muted" : "text-ok")}>{t.busy ? "Serving someone" : "Free"}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </Sheet>
  );
}

export function NoteSheet({ open, onClose, current }: { open: boolean; onClose: () => void; current: QueueEntry }) {
  const save = useSetNote();
  const toast = useToast();
  const [text, setText] = useState(current.note ?? "");
  const over = text.length > STAFF_POLICY.noteMaxLength;
  return (
    <Sheet open={open} onClose={onClose} title={`Note for ${current.code}`}>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save.mutateAsync(text);
            onClose();
          } catch (err) {
            toast.show({ title: "Could not save the note", body: errorMessage(err), tone: "warn" });
          }
        }}
      >
        <label htmlFor="staff-note" className="text-[13px] text-muted">Only staff see this. It goes away when the visit is closed.</label>
        <textarea
          id="staff-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          autoFocus
          aria-invalid={over || undefined}
          className="w-full resize-none rounded-[16px] bg-white p-3.5 text-[15px] leading-snug shadow-[inset_0_0_0_1px_rgba(43,26,32,.15)] outline-none focus:shadow-[inset_0_0_0_2px_var(--color-primary-strong)]"
          placeholder="For example: needs a pen, form is incomplete"
        />
        <p className={cn("flex items-center justify-between text-xs", over ? "text-rust" : "text-muted")}>
          <span className="flex items-center gap-1.5">{over ? <Icon name="warn" size={13} /> : null}{over ? "Too long" : ""}</span>
          <span>{text.length}/{STAFF_POLICY.noteMaxLength}</span>
        </p>
        <Button type="submit" loading={save.isPending} disabled={over}>Save note</Button>
      </form>
    </Sheet>
  );
}
