"use client";
import { useState } from "react";
import { Button, Icon, InlineNote, Sheet } from "@/components/ui";
import { env } from "@/lib/env";
import { useToast } from "@/components/ui";
import { useAlertSetup } from "./use-alert-setup";

/** Screen 10's soft ask. The browser's own prompt only appears after "Turn on alerts". */
export function AlertsAsk({ open, onClose, ahead }: { open: boolean; onClose: () => void; ahead?: number }) {
  const setup = useAlertSetup();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const turnOn = async () => {
    setBusy(true);
    setProblem(null);
    const out = await setup.enable();
    setBusy(false);
    if (out === "granted") {
      toast.show({ title: "Alerts are on", body: "We will tell you when you are 3 away.", tone: "success" });
      onClose();
    } else if (out === "needs_install") {
      setProblem("On iPhone, alerts only work once QBIT9 is added to your Home Screen. Tap Share, then Add to Home Screen, and open it from there.");
    } else if (out === "denied") {
      setProblem("Alerts are blocked in your browser. You can change that in your browser settings, or keep this tab open and we will show updates here.");
    } else {
      setProblem("This browser cannot show alerts. Keep this tab open and we will show updates here.");
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Get an alert when you are 3 away">
      <div className="mt-3 flex flex-col gap-3">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-rose text-deep"><Icon name="bell" size={22} /></span>
        <p className="text-sm leading-snug text-muted">
          Your browser will ask for permission next.{" "}
          {env.featureSms ? "You will also get an SMS, so you cannot miss your turn." : env.backgroundAlerts ? "You can close this page and we will still reach you." : "Keep this tab open, it can sit in the background."}
          {ahead != null && ahead > 3 ? ` You are ${ahead} away now.` : ""}
        </p>
        {problem ? <InlineNote tone="warn" icon="info">{problem}</InlineNote> : null}
        <Button icon="bell" loading={busy} onClick={turnOn}>Turn on alerts</Button>
        <Button variant="link" onClick={onClose}>{env.featureSms ? "Only SMS, please" : "Not now"}</Button>
      </div>
    </Sheet>
  );
}
