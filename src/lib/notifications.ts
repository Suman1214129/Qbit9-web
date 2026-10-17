export type AlertPermission = "granted" | "denied" | "default" | "unsupported";

export const isIOS = () =>
  typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !("MSStream" in window);

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iPhone only delivers web notifications to sites added to the Home Screen. */
export const needsHomeScreenForAlerts = () => isIOS() && !isStandalone();

export function alertPermission(): AlertPermission {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/** Must be called from a user gesture. Resolves with the final permission. */
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export interface AlertPayload {
  title: string;
  body: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string;
  url?: string;
  vibrate?: boolean;
}

/** Show a system notification, via the service worker when present (works with the tab in the background). */
export async function showAlert(p: AlertPayload): Promise<boolean> {
  if (alertPermission() !== "granted") return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: p.body,
    tag: p.tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    data: { url: p.url ?? "/home" },
    renotify: true,
  };
  if (p.vibrate) options.vibrate = [200, 100, 200, 100, 400];
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(p.title, options);
      return true;
    }
    new Notification(p.title, options);
    return true;
  } catch {
    return false;
  }
}

export function buzz(pattern: number | number[] = [200, 100, 200]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* unsupported */
  }
}
