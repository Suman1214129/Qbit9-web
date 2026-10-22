"use client";
import { useRouter } from "next/navigation";
import { Button, InlineNote, Sheet, useToast } from "@/components/ui";
import { useEndShift } from "@/hooks/staff/mutations";
import { errorMessage } from "@/lib/errors";
import { pluralize } from "@/lib/format";

/** End shift needs a clear counter. It says so instead of failing after the tap. */
export function EndShiftSheet({ open, onClose, hasCurrent, waitingMine }: { open: boolean; onClose: () => void; hasCurrent: boolean; waitingMine: number }) {
  const router = useRouter();
  const toast = useToast();
  const end = useEndShift();
  return (
    <Sheet open={open} onClose={onClose} title="End your shift?">
      <div className="mt-3 flex flex-col gap-4">
        {hasCurrent ? (
          <InlineNote icon="warn" tone="warn">Someone is still at your counter. Finish with them first, then end your shift.</InlineNote>
        ) : (
          <p className="text-[14.5px] leading-snug text-muted">
            {waitingMine > 0
              ? `${waitingMine} ${pluralize(waitingMine, "person is", "people are")} still waiting for your services. Other counters will take them.`
              : "Nobody is waiting for your services. Your counter will close and customers will no longer be sent to it."}
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          <Button
            loading={end.isPending}
            disabled={hasCurrent}
            onClick={async () => {
              try {
                await end.mutateAsync();
                onClose();
                router.replace("/staff/start");
              } catch (e) {
                toast.show({ title: "Could not end your shift", body: errorMessage(e), tone: "warn" });
              }
            }}
          >
            End shift
          </Button>
          <Button variant="outline" onClick={onClose}>Keep working</Button>
        </div>
      </div>
    </Sheet>
  );
}
