"use client";
import { useEffect, useEffectEvent, useRef } from "react";
import { usePathname } from "next/navigation";
import type { TokenView } from "@/domain";
import { useActiveToken, usePreferences, useSession } from "@/hooks/queries";
import { buzz, setAppBadge, showAlert } from "@/lib/notifications";
import { useServices } from "@/providers/services-provider";
import { useToast } from "@/components/ui";
import { diffAlerts, type AlertMessage } from "./diff";

/**
 * Mounted once. Watches the active token and tells the customer when something changes:
 * in-app toast while the page is visible, a system notification when it is not (and allowed).
 * With the tab closed only a server push can reach the phone, see docs/backend-handoff.md.
 */
export function AlertsWatcher() {
  const { queue } = useServices();
  const { data: session } = useSession();
  const { data: token } = useActiveToken(!!session);
  const { data: prefs } = usePreferences(!!session);
  const toast = useToast();
  const pathname = usePathname();
  const prev = useRef<TokenView | null>(null);
  const onTokenPage = pathname.startsWith("/token/");
  const firstName = session?.user.name?.split(" ")[0] ?? null;

  const deliver = useEffectEvent((m: AlertMessage) => {
    const visible = document.visibilityState === "visible";
    if (m.vibrate) buzz(m.tag.endsWith("called") ? [200, 100, 200, 100, 400] : [200, 100, 200]);
    if (visible) {
      if (!onTokenPage || m.tone === "warn") toast.show({ title: m.title, body: m.body, tone: m.tone });
    } else if (prefs?.browserAlerts) {
      void showAlert({ title: m.title, body: m.body, tag: m.tag, url: m.url, vibrate: m.vibrate });
    }
  });

  useEffect(() => {
    const before = prev.current;
    if (token) {
      prev.current = token;
      setAppBadge(token.stage === "waiting" || token.stage === "checkin" ? token.ahead : 0);
      if (before) diffAlerts(before, token, firstName).forEach((m) => deliver(m));
    } else if (before) {
      // The token left the active set (served, missed, left). Fetch its final state to report it.
      prev.current = null;
      setAppBadge(0);
      void queue.get({ id: before.id }).then((final) => diffAlerts(before, final, firstName).forEach((m) => deliver(m)), () => {});
    }
  }, [token, firstName, queue]);

  return null;
}
