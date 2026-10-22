import { DomainError, finishServing, nearArrivesAt, reconcile, startServing, stageOf, DEFAULT_POLICY, type EpochMs } from "@/domain";
import { clock } from "@/lib/clock";
import { currentUser } from "./auth";
import { ctxFor, syncUserTokens, userRows } from "./engine";
import { loadDev, mutate, onDevChange, resetDb, saveDev, type MockTokenRow } from "./db";
import type { DevApi, DevSettings } from "../types";
import { findService } from "./catalogue";
import { STAFF_SERVICE_MS } from "./staff/live";
import { paceFor } from "./engine";
import { countersFor } from "./catalogue";
import { branchById } from "./engine";

function withRow(tokenId: string, fn: (row: MockTokenRow, now: EpochMs) => MockTokenRow | void): void {
  const now = clock.now();
  mutate((db) => {
    const user = currentUser(db, now);
    const row = db.tokens[tokenId];
    if (!row || row.userId !== user.id) throw new DomainError("token_not_found");
    const out = fn(row, now);
    if (out) db.tokens[tokenId] = out;
  });
}

/** Mock only. Moves a token's own timeline so the rest of the app is untouched. */
export function createDevApi(): DevApi {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  onDevChange(notify);

  return {
    settings: () => loadDev(),

    update(patch: Partial<DevSettings>) {
      const prev = loadDev();
      const next = { ...prev, ...patch };
      saveDev(next);
      // Re-pace live tokens without making places jump.
      if (patch.speed && patch.speed !== prev.speed) {
        const now = clock.now();
        mutate((db) => {
          const s = db.session;
          if (!s) return;
          syncUserTokens(db, s.userId, now);
          for (const row of userRows(db, s.userId)) {
            if (row.calledAt != null || row.servedAt != null || row.missedAt != null || row.leftAt != null) continue;
            const ahead = Math.max(0, row.aheadAtJoin + row.delayPositions - Math.floor((now - row.joinedAt) / row.stepMs));
            const found = findService(row.serviceId);
            const branch = branchById(row.branchId, now);
            const counters = Math.max(1, branch ? countersFor(branch, row.groupId).length : 1);
            const pace = paceFor(next.speed, found?.service.avgServiceMin ?? 6, counters);
            const cleared = row.aheadAtJoin + row.delayPositions - ahead;
            db.tokens[row.id] = { ...row, ...pace, joinedAt: now - cleared * pace.stepMs, checkinPromptedAt: null };
          }
        });
      }
      notify();
    },

    async skipToNearby(id) {
      withRow(id, (row, now) => {
        const ctx = ctxFor(row);
        // Staff are working the real queue, so the line cannot be skipped. Just open the prompt.
        if (ctx.live) {
          if (row.checkinConfirmedAt == null && row.checkinPromptedAt == null) return { ...row, checkinPromptedAt: now };
          return;
        }
        const base = row.aheadAtJoin + row.delayPositions;
        if (base <= DEFAULT_POLICY.nearThreshold) return;
        const next: MockTokenRow = { ...row, joinedAt: now - row.stepMs * (base - DEFAULT_POLICY.nearThreshold), checkinPromptedAt: null };
        next.checkinPromptedAt = nearArrivesAt(next, ctx);
        return { ...next, ...reconcile(next, ctx, now).record };
      });
    },

    async callNow(id) {
      withRow(id, (row, now) => {
        const ctx = ctxFor(row);
        // Staff are working the real queue: act like a counter calling this token right now.
        if (ctx.live) {
          if (row.calledAt != null) return;
          return { ...row, checkinConfirmedAt: row.checkinConfirmedAt ?? now, calledAt: now, counter: ctx.counterFor(row), serviceMs: STAFF_SERVICE_MS };
        }
        const base = row.aheadAtJoin + row.delayPositions;
        const next = { ...row, joinedAt: now - row.stepMs * base, checkinConfirmedAt: row.checkinConfirmedAt ?? now };
        return { ...next, ...reconcile(next, ctxFor(next), now).record };
      });
    },

    async staffStartServing(id) {
      withRow(id, (row, now) => ({ ...row, ...startServing(row, ctxFor(row), now).record }));
    },

    async staffFinish(id) {
      withRow(id, (row, now) => ({ ...row, ...finishServing(row, ctxFor(row), now).record }));
    },

    async expireCall(id) {
      withRow(id, (row, now) => {
        if (stageOf(row, ctxFor(row), now) !== "called") throw new DomainError("invalid_state", "Not called yet");
        const gone = DEFAULT_POLICY.calledWindowMs + row.extraTimeMs + 1000;
        const next = { ...row, calledAt: (row.calledAt ?? now) - gone };
        return { ...next, ...reconcile(next, ctxFor(next), now).record };
      });
    },

    async reset() {
      resetDb();
      notify();
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
