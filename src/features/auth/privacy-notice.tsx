"use client";
import { Button, Sheet } from "@/components/ui";

/**
 * SAMPLE notice text. The bank's legal team owns the final wording (DPDP Act consent, retention
 * period, grievance contact). Keep the structure: what, why, how long, how to withdraw.
 */
export function PrivacyNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="How we use your data">
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink/90">
        <p><b>What we keep.</b> Your mobile number or email, the name you give, your tokens and bookings, and the alerts you choose.</p>
        <p><b>Your location.</b> Read once to confirm you are at the branch, and once when you are nearly up. The coordinates are used for that check and then discarded. We never track you in between.</p>
        <p><b>Why.</b> To issue tokens, tell you when it is your turn, and show your visit history. Nothing is sold or used for advertising.</p>
        <p><b>How long.</b> Visit history is kept for 12 months, then removed. [Sample period, to be confirmed with the bank.]</p>
        <p><b>Your choices.</b> You can log out any time, change alerts in Profile, and use Delete my data to remove your account and everything attached to it.</p>
        <Button onClick={onClose} className="mt-2">Got it</Button>
      </div>
    </Sheet>
  );
}
