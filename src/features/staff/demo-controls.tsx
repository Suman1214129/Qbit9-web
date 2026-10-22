"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon, Sheet, useToast } from "@/components/ui";
import { useIsClient } from "@/hooks/use-is-client";
import { staffKeys } from "@/hooks/staff/keys";
import { errorMessage } from "@/lib/errors";
import { useServices } from "@/providers/services-provider";

/** Mock adapter only. Lets one person demo the whole staff day without a second person or waiting. */
export function DemoControls() {
  const { staffDev } = useServices();
  const mounted = useIsClient();
  const [open, setOpen] = useState(false);
  if (!staffDev || !mounted) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Open demo tools"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(86px+var(--safe-bottom))] left-3 z-40 flex size-9 items-center justify-center rounded-full bg-ink/85 text-on-primary shadow-pop backdrop-blur transition hover:bg-ink lg:bottom-4 lg:left-4"
      >
        <Icon name="sliders" size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Demo tools">
        <Panel onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { staffDev } = useServices();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  if (!staffDev) return null;

  const run = async (label: string, fn: () => Promise<void>, close = false) => {
    setBusy(label);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: staffKeys.all });
      toast.show({ title: label, tone: "success", ms: 1600 });
      if (close) onClose();
    } catch (e) {
      toast.show({ title: "Could not do that", body: errorMessage(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-[13px] leading-snug text-muted">Demo mode only. Customers here are simulated. Real app tokens from the customer app in this browser show up too, and staff actions reach them.</p>
      <Button variant="soft" size="sm" loading={busy === "Added 3 customers"} onClick={() => run("Added 3 customers", () => staffDev.addCustomers(3))}>Add 3 customers to my queue</Button>
      <Button variant="soft" size="sm" loading={busy === "Customer arrived"} onClick={() => run("Customer arrived", () => staffDev.arriveNow())}>Called customer reaches the counter now</Button>
      <Button variant="danger" size="sm" loading={busy === "Staff demo data cleared"} onClick={() => run("Staff demo data cleared", () => staffDev.resetFloor(), true)}>Clear staff demo data</Button>
    </div>
  );
}
