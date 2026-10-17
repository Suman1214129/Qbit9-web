"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Field, ListRow, Sheet } from "@/components/ui";
import { TopBar } from "@/components/layout";
import { displayPhone, initialOf, validateName } from "@/domain";
import { useDeleteAccount, useSignOut, useUpdateProfile } from "@/hooks/mutations";
import { usePreferences, useSession } from "@/hooks/queries";
import { clearDraft } from "@/features/join/draft";
import { env } from "@/lib/env";
import { markLeaving } from "@/lib/leaving";
import { useAlertSetup } from "@/features/token/use-alert-setup";

const PRIORITY_LABEL = { senior_citizen: "Senior citizen", pensioner: "Pensioner", disability: "Disability" } as const;

/** Screen 19. Log out is outlined in rust: findable, not shouting. Consent and deletion live here too. */
export function ProfileScreen() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: prefs } = usePreferences(!!session);
  const { enabled } = useAlertSetup();
  const signOut = useSignOut();
  const del = useDeleteAccount();
  const update = useUpdateProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const user = session?.user;
  if (!user) return null;

  const alertsSummary = [enabled && "Browser", prefs?.emailAlerts && user.email && "Email", env.featureSms && prefs?.smsAlerts && "SMS"].filter(Boolean).join(" and ") || "Off";
  const priority = user.priority.length ? user.priority.map((p) => PRIORITY_LABEL[p]).join(", ") : "None";

  const saveName = async () => {
    const r = validateName(name);
    if (!r.ok) return setNameError(r.error);
    await update.mutateAsync({ name: r.value });
    setEditing(false);
  };

  const logout = async () => {
    markLeaving();
    await signOut.mutateAsync();
    clearDraft();
    router.replace("/");
  };

  const remove = async () => {
    markLeaving();
    await del.mutateAsync();
    clearDraft();
    router.replace("/");
  };

  return (
    <div className="pb-4">
      <TopBar title="Profile" />
      <div className="mx-auto max-w-[640px] pt-5">
        <button type="button" onClick={() => { setName(user.name ?? ""); setNameError(null); setEditing(true); }} className="flex w-full items-center gap-3.5 text-left" aria-label="Edit your name">
          <Avatar initial={initialOf(user.name)} size={58} />
          <span>
            <b className="block text-[20px] font-semibold tracking-[-.3px]">{user.name ?? "Add your name"}</b>
            <span className="text-[13px] text-muted">{user.phone ? displayPhone(user.phone) : user.email}</span>
          </span>
        </button>

        <div className="mt-4">
          <ListRow icon="bank" title="Saved branches" value={prefs?.savedBranchIds.length ?? 0} href="/profile/branches" />
          <ListRow icon="bell" title="Alerts" value={alertsSummary} href="/profile/alerts" />
          <ListRow icon="star" title="Priority" value={priority} href="/profile/priority" />
          <ListRow icon="shield" title="Privacy and consent" href="/profile/privacy" />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button variant="danger" icon="out" loading={signOut.isPending} onClick={logout}>Log out</Button>
          <Button variant="link" onClick={() => { setConfirmText(""); setConfirmDelete(true); }} className="text-rust">Delete my data</Button>
        </div>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Your name">
        <form className="mt-3 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void saveName(); }}>
          <Field label="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} error={nameError} hint="Staff use it when calling you." maxLength={40} autoFocus />
          <Button type="submit" loading={update.isPending}>Save</Button>
        </form>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete my data">
        <div className="mt-2 flex flex-col gap-3 text-sm leading-snug">
          <p className="text-muted">This removes your account, tokens, bookings and alert settings from this service. It cannot be undone. If you are in a queue, you lose your place.</p>
          <Field label="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoCapitalize="characters" />
          <Button variant="danger" disabled={confirmText.trim().toUpperCase() !== "DELETE"} loading={del.isPending} onClick={remove}>Delete everything</Button>
          <Button variant="link" onClick={() => setConfirmDelete(false)}>Keep my account</Button>
        </div>
      </Sheet>
    </div>
  );
}
