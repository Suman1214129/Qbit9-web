"use client";
import { useCallback, useState } from "react";
import { useUpdatePreferences } from "@/hooks/mutations";
import { usePreferences, useSession } from "@/hooks/queries";
import { alertPermission, needsHomeScreenForAlerts, requestAlertPermission, showAlert, type AlertPermission } from "@/lib/notifications";

export type AlertOutcome = "granted" | "denied" | "unsupported" | "needs_install";

/** Browser alert opt-in. The permission prompt only ever follows a tap on "Turn on alerts". */
export function useAlertSetup() {
  const { data: session } = useSession();
  const { data: prefs } = usePreferences(!!session);
  const update = useUpdatePreferences();
  const [permission, setPermission] = useState<AlertPermission>(() => alertPermission());

  const enable = useCallback(async (): Promise<AlertOutcome> => {
    if (needsHomeScreenForAlerts()) return "needs_install";
    const result = await requestAlertPermission();
    setPermission(result);
    if (result === "granted") {
      await update.mutateAsync({ browserAlerts: true });
      void showAlert({ title: "Alerts are on", body: "We will tell you when you are 3 away and when it is your turn.", tag: "alerts-on" });
      return "granted";
    }
    return result === "unsupported" ? "unsupported" : "denied";
  }, [update]);

  const disable = useCallback(() => update.mutateAsync({ browserAlerts: false }), [update]);

  const active = !!prefs?.browserAlerts && permission === "granted";
  return { permission, enabled: active, prefs, enable, disable, refresh: () => setPermission(alertPermission()) };
}
