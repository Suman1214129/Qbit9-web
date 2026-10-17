"use client";
import { useCallback, useEffect, useState } from "react";
import { isIOS, isStandalone } from "@/lib/notifications";
import { useIsClient } from "./use-is-client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Add to Home Screen. Android/Chrome gives a real prompt; iPhone only gets instructions. */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const client = useIsClient();
  const [justInstalled, setJustInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setJustInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return false;
    await evt.prompt();
    const choice = await evt.userChoice;
    setEvt(null);
    return choice.outcome === "accepted";
  }, [evt]);

  const installed = justInstalled || (client && isStandalone());
  return { installed, canPrompt: !!evt, ios: typeof navigator !== "undefined" && isIOS(), install };
}
