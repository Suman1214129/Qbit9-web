"use client";
import { useState } from "react";
import { Button, Chip, InlineNote, Sheet, Switch, useToast } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { useUpdatePreferences } from "@/hooks/mutations";
import { usePreferences, useSession } from "@/hooks/queries";
import { env } from "@/lib/env";
import { needsHomeScreenForAlerts } from "@/lib/notifications";
import { useAlertSetup } from "@/features/token/use-alert-setup";

/** Screen 20. Includes the fallback: what to do when the browser has blocked notifications. */
export function AlertsScreen() {
  const { data: session } = useSession();
  const { data: prefs } = usePreferences(!!session);
  const update = useUpdatePreferences();
  const setup = useAlertSetup();
  const toast = useToast();
  const [help, setHelp] = useState(false);
  const blocked = setup.permission === "denied";
  const unsupported = setup.permission === "unsupported";
  const ios = needsHomeScreenForAlerts();

  const toggleBrowser = async (on: boolean) => {
    if (!on) return void setup.disable();
    const out = await setup.enable();
    if (out === "granted") toast.show({ title: "Browser alerts are on", tone: "success" });
    else if (out === "needs_install") setHelp(true);
    else if (out === "denied") setHelp(true);
  };

  return (
    <div className="pb-4">
      <TopBar title="Alerts" back="/profile" />
      <div className="mx-auto max-w-[640px] pt-2">
        <Row title="Browser alerts" detail={blocked ? "Blocked for this site. Tap the lock in the address bar, then allow Notifications." : unsupported ? "This browser cannot show alerts. Updates still appear on the token page." : "A notification when you are 3 away and when it is your turn."} badge={blocked ? <Chip tone="peach">Blocked</Chip> : null}>
          <Switch checked={setup.enabled} disabled={unsupported} onChange={toggleBrowser} label="Browser alerts" />
        </Row>

        {session?.user.email ? (
          <Row title="Email alerts" detail={`Sent to ${session.user.email}. Useful as a backup.`}>
            <Switch checked={!!prefs?.emailAlerts} onChange={(v) => update.mutate({ emailAlerts: v })} label="Email alerts" />
          </Row>
        ) : null}

        {env.featureSms ? (
          <>
            <Row title="SMS alerts" detail="Always on for your token, so you never miss a turn.">
              <Switch checked={!!prefs?.smsAlerts} onChange={(v) => update.mutate({ smsAlerts: v })} label="SMS alerts" />
            </Row>
            <Row title="WhatsApp alerts" detail="Optional. Needs your consent first.">
              <Switch checked={!!prefs?.whatsappAlerts} onChange={(v) => update.mutate({ whatsappAlerts: v })} label="WhatsApp alerts" />
            </Row>
          </>
        ) : null}

        {ios ? (
          <div className="mt-4"><InlineNote tone="warn" icon="info">On iPhone, add QBIT9 to your Home Screen first. Safari only sends browser alerts to Home Screen web apps.</InlineNote></div>
        ) : null}
        {!env.backgroundAlerts ? <p className="mt-4 text-xs leading-snug text-muted">Demo build: alerts arrive while this page is open, even in a background tab. Alerts with the page closed need the live server.</p> : null}

        {blocked || ios ? <Button className="mt-5" variant="outline" onClick={() => setHelp(true)}>Show me how to turn on alerts</Button> : null}
      </div>

      <Sheet open={help} onClose={() => setHelp(false)} title="Turn on alerts">
        <ol className="mt-3 flex list-decimal flex-col gap-2.5 pl-5 text-sm leading-snug">
          {ios ? (
            <><li>Tap the Share button in Safari.</li><li>Choose Add to Home Screen.</li><li>Open QBIT9 from your Home Screen and turn on alerts there.</li></>
          ) : (
            <><li>Tap the lock icon in the address bar.</li><li>Open Permissions, then Notifications.</li><li>Choose Allow, then come back and turn the switch on.</li></>
          )}
        </ol>
        <Button className="mt-4" onClick={() => { setHelp(false); setup.refresh(); }}>Got it</Button>
      </Sheet>
    </div>
  );
}

function Row({ title, detail, badge, children }: { title: string; detail: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-line py-3">
      <div className="flex-1 text-[15px] font-medium">
        <span className="flex items-center gap-2">{title}{badge}</span>
        <small className="mt-0.5 block text-[12.5px] leading-snug font-normal text-muted">{detail}</small>
      </div>
      {children}
    </div>
  );
}
