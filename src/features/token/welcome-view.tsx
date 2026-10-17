"use client";
import { useState } from "react";
import { Button } from "@/components/ui";
import { type TokenView } from "@/domain";
import { AlertsAsk } from "./alerts-ask";
import { BringList, TokenSlipFor } from "./token-details";
import { useAlertSetup } from "./use-alert-setup";

/** Screen 10: the token exists. Show it, what to bring, and ask for alerts while the reason is obvious. */
export function WelcomeView({ token, onContinue }: { token: TokenView; onContinue: () => void }) {
  const { enabled } = useAlertSetup();
  const [ask, setAsk] = useState(() => !enabled);
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
      <div className="flex flex-col gap-4">
        <TokenSlipFor token={token} />
        <p className="text-center text-xs text-muted">Show this at the counter if asked.</p>
      </div>
      <div className="flex flex-col gap-5">
        <BringList items={token.bring} />
        <div className="mt-auto flex flex-col gap-2.5 pt-2">
          <Button iconRight="arrow" onClick={onContinue}>Follow my place</Button>
          {!enabled ? <Button variant="link" onClick={() => setAsk(true)}>Turn on alerts</Button> : null}
        </div>
      </div>
      <AlertsAsk open={ask} onClose={() => setAsk(false)} ahead={token.ahead} />
    </div>
  );
}
