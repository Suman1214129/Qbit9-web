"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_POLICY } from "@/domain";
import { useSession } from "@/hooks/queries";
import { clock } from "@/lib/clock";
import { useJoinDraft } from "./draft";

/**
 * The service and review screens need a branch, a fresh location proof and a signed in customer.
 * Anything missing sends the customer back to the right earlier step instead of failing at the end.
 */
export function useJoinGuard({ paused = false }: { paused?: boolean } = {}) {
  const router = useRouter();
  const draft = useJoinDraft();
  const { data: session, isPending } = useSession();

  const locationHref = draft.bankSlug && draft.branchSlug ? `/b/${draft.bankSlug}/${draft.branchSlug}/location` : null;
  const stale = draft.proof ? clock.now() - draft.proof.capturedAt > DEFAULT_POLICY.proofTtlMs : false;

  useEffect(() => {
    if (isPending || paused) return;
    if (!draft.branchId || !locationHref) return void router.replace("/branches");
    if (!draft.proof) return void router.replace(`${locationHref}?auto=1`);
    if (stale) return void router.replace(`${locationHref}?reason=stale`);
    if (!session) router.replace("/sign-in");
  }, [isPending, paused, draft.branchId, draft.proof, locationHref, stale, session, router]);

  const ready = !isPending && !!session && !!draft.branchId && !!draft.proof && !stale;
  return { ready, draft, session, locationHref };
}
