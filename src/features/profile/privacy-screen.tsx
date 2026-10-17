"use client";
import { useState } from "react";
import { Button, ListRow, useToast } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { useServices } from "@/providers/services-provider";
import { downloadFile } from "@/lib/ics";
import { PrivacyNotice } from "@/features/auth/privacy-notice";
import { useSession } from "@/hooks/queries";

/** Consent and the right to a copy of your data. Deletion lives on Profile. */
export function PrivacyScreen() {
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const services = useServices();
  const toast = useToast();
  const { data: session } = useSession();

  const exportData = async () => {
    setBusy(true);
    try {
      const [history, bookings, prefs] = await Promise.all([services.history.list(), services.bookings.list(), services.preferences.get()]);
      downloadFile("qbit9-my-data.json", JSON.stringify({ exportedAt: new Date().toISOString(), profile: session?.user, preferences: prefs, visits: history.items, bookings }, null, 2), "application/json");
      toast.show({ title: "Your data was downloaded", tone: "success" });
    } catch {
      toast.show({ title: "We could not export your data", tone: "warn" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-4">
      <TopBar title="Privacy and consent" back="/profile" />
      <div className="mx-auto max-w-[640px] pt-2">
        <ListRow icon="shield" title="How we use your data" sub="What we keep, why, and for how long." onClick={() => setNotice(true)} />
        <ListRow icon="pin" title="Your location" sub="Read once to join and once to check in. Never tracked in between, never stored after the check." trailing={<span />} />
        <div className="mt-5 flex flex-col gap-3">
          <Button variant="outline" icon="download" loading={busy} onClick={exportData}>Download my data</Button>
          <p className="text-center text-xs text-muted">To remove your account and everything attached to it, use Delete my data on the Profile screen.</p>
        </div>
      </div>
      <PrivacyNotice open={notice} onClose={() => setNotice(false)} />
    </div>
  );
}
