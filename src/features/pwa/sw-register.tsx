"use client";
import { useEffect } from "react";

/** Registers the notification service worker. It does no caching, so it cannot serve stale screens. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
