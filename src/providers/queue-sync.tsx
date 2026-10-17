"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/hooks/keys";
import { useSession } from "@/hooks/queries";
import { useServices } from "./services-provider";

/** Bridges the service's change signal (mock timer today, Realtime later) to query invalidation. */
export function QueueSync() {
  const { queue } = useServices();
  const { data: session } = useSession();
  const qc = useQueryClient();
  useEffect(() => {
    if (!session) return;
    return queue.subscribe(() => {
      void qc.invalidateQueries({ queryKey: keys.active });
      void qc.invalidateQueries({ queryKey: keys.tokens });
      void qc.invalidateQueries({ queryKey: keys.bookings });
    });
  }, [queue, qc, session]);
  return null;
}
