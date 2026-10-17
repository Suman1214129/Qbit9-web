"use client";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useIsClient } from "@/hooks/use-is-client";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Icon, Segmented, Sheet, Switch, useToast } from "@/components/ui";
import { useActiveToken, useSession } from "@/hooks/queries";
import { useServices } from "@/providers/services-provider";
import type { DevSettings } from "@/services/types";

const SPEEDS = [
  { value: "demo", label: "Demo" },
  { value: "fast", label: "Fast" },
  { value: "realistic", label: "Real" },
] as const;

const LOCATIONS: { value: DevSettings["location"]; label: string }[] = [
  { value: "real", label: "Real GPS" },
  { value: "at_branch", label: "At the branch (40 m)" },
  { value: "too_far", label: "Too far (3.2 km)" },
  { value: "blocked", label: "Permission blocked" },
  { value: "inaccurate", label: "Poor accuracy" },
];

/** Mock adapter only. Lets you reach every state of the customer flow without waiting or travelling. */
export function DevPanel() {
  const { dev } = useServices();
  const [open, setOpen] = useState(false);
  const mounted = useIsClient();
  if (!dev || !mounted) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Open developer tools"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(86px+var(--safe-bottom))] left-3 z-40 flex size-9 items-center justify-center rounded-full bg-ink/85 text-on-primary shadow-pop backdrop-blur transition hover:bg-ink lg:bottom-4 lg:left-4"
      >
        <Icon name="sliders" size={16} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Developer tools">
        <Panel onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { dev } = useServices();
  const toast = useToast();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: session } = useSession();
  const { data: token } = useActiveToken(!!session);
  const settings = useSyncExternalStore(
    (cb) => dev?.subscribe(cb) ?? (() => {}),
    () => JSON.stringify(dev?.settings()),
    () => "{}",
  );
  const s = JSON.parse(settings) as DevSettings;
  const [busy, setBusy] = useState(false);
  if (!dev) return null;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries();
      toast.show({ title: label, tone: "success", ms: 1800 });
    } catch (e) {
      toast.show({ title: e instanceof Error ? e.message : "Failed", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-4 text-sm">
      <p className="text-[13px] leading-snug text-muted">Mock backend only. Nothing here exists in production.</p>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">Queue speed</h3>
        <Segmented label="Queue speed" options={SPEEDS.map((x) => ({ ...x }))} value={s.speed} onChange={(speed) => dev.update({ speed })} />
        <p className="text-xs text-muted">Demo: one place every 20 s. Fast: 6 s. Real: actual service pace.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">Location reading</h3>
        <div className="flex flex-wrap gap-1.5">
          {LOCATIONS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => dev.update({ location: l.value })}
              className={`rounded-chip px-2.5 py-1.5 text-xs ${s.location === l.value ? "bg-primary-strong text-white" : "bg-white shadow-[inset_0_0_0_1px_rgba(43,26,32,.12)]"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <label className="flex items-center justify-between gap-3">
        <span>
          Branches are closed
          <span className="block text-xs text-muted">Try the closed states and booking-only paths.</span>
        </span>
        <Switch checked={s.forceClosed} onChange={(forceClosed) => dev.update({ forceClosed })} label="Branches are closed" />
      </label>

      <section className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold">
          Active token {token ? <span className="font-normal text-muted">{token.code}, {token.stage}</span> : <span className="font-normal text-muted">none</span>}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" disabled={!token || busy || token.stage !== "waiting"} onClick={() => run("Jumped to 3 away", () => dev.skipToNearby(token!.id))}>Skip to 3 away</Button>
          <Button size="sm" variant="outline" disabled={!token || busy || !["waiting", "checkin"].includes(token.stage)} onClick={() => run("Called", () => dev.callNow(token!.id))}>Call me now</Button>
          <Button size="sm" variant="outline" disabled={!token || busy || token.stage !== "called"} onClick={() => run("Staff started serving", () => dev.staffStartServing(token!.id))}>Staff: start serving</Button>
          <Button size="sm" variant="outline" disabled={!token || busy || !["called", "serving"].includes(token.stage)} onClick={() => run("Staff closed the visit", () => dev.staffFinish(token!.id))}>Staff: finish</Button>
          <Button size="sm" variant="outline" className="col-span-2" disabled={!token || busy || token.stage !== "called"} onClick={() => run("Call window expired", () => dev.expireCall(token!.id))}>Let the call window expire</Button>
        </div>
      </section>

      <Button
        variant="danger"
        size="sm"
        disabled={busy}
        onClick={() =>
          run("Mock data cleared", async () => {
            await dev.reset();
            onClose();
            qc.clear();
            router.replace("/");
          })
        }
      >
        Reset all mock data
      </Button>
    </div>
  );
}
