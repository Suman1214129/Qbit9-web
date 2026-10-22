"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServices } from "@/providers/services-provider";
import { staffKeys } from "./keys";

/**
 * Keeps staff screens fresh without polling alone: the service tells us when something changed
 * (another tab, a customer joining or answering a call) and we invalidate. A backend uses Realtime
 * for the same callback.
 */
export function useStaffSync(enabled: boolean) {
  const { staff } = useServices();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return staff.subscribe(() => {
      void qc.invalidateQueries({ queryKey: staffKeys.counter });
      void qc.invalidateQueries({ queryKey: staffKeys.queues });
      void qc.invalidateQueries({ queryKey: staffKeys.today });
      void qc.invalidateQueries({ queryKey: staffKeys.roster });
    });
  }, [enabled, staff, qc]);
}
