import { DEFAULT_POLICY, buildHistory, estimateWait, historyStats, waitMid, type TokenRecord } from "@/domain";
import { clock } from "@/lib/clock";
import { currentUser } from "./auth";
import { countersFor, findService } from "./catalogue";
import { branchById } from "./engine";
import { mutate } from "./db";
import type { HistoryService } from "../types";

export function createHistoryService(): HistoryService {
  return {
    async list() {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const tokens = Object.values(db.tokens).filter((t) => t.userId === user.id);
        const bookings = Object.values(db.bookings).filter((b) => b.userId === user.id);
        const items = buildHistory(tokens, bookings, {
          timezone: "Asia/Kolkata",
          branchName: (id) => branchById(id, now)?.name ?? "Branch",
          serviceName: (id) => findService(id)?.service.name ?? "Service",
          savedMin: (t: TokenRecord) => {
            const branch = branchById(t.branchId, now);
            const found = findService(t.serviceId);
            if (!branch || !found) return null;
            const counters = Math.max(1, countersFor(branch, t.groupId).length);
            return Math.round(waitMid(estimateWait(Math.max(0, t.aheadAtJoin - DEFAULT_POLICY.nearThreshold), found.service.avgServiceMin, counters)));
          },
        });
        return { items, stats: historyStats(items) };
      });
    },
  };
}
