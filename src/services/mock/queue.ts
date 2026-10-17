import {
  DEFAULT_POLICY, DomainError, aheadForNewToken, assertWithinBranch, confirmCheckin, canCheckInBooking, formatTokenCode,
  isActiveStage, leaveQueue, markOnMyWay, moveBack, reconcile, requestMoreTime, stageOf,
  type Branch, type LocationProof, type TokenRecord, type TokenView, type EpochMs, type PriorityTag, type Service, type ServiceGroup, type TokenSource,
} from "@/domain";
import { clock } from "@/lib/clock";
import { hash, ambientWaiting, findService } from "./catalogue";
import { currentUser } from "./auth";
import { branchById, ctxFor, dateKeyFor, devSettings, paceFor, syncRow, syncUserTokens, userRows, viewOf } from "./engine";
import { isBranchOpen } from "./branches";
import { loadDb, mutate, onDbChange, uid, type MockDb, type MockTokenRow } from "./db";
import type { QueueService, TokenRef } from "../types";

function nextNumber(db: MockDb, branch: Branch, groupId: string, now: EpochMs): number {
  const key = `${branch.id}|${groupId}|${dateKeyFor(branch, now)}`;
  const last = db.numbers[key] ?? 40 + (hash(key) % 25);
  db.numbers[key] = last + 1;
  return last + 1;
}

interface NewToken {
  branch: Branch;
  group: ServiceGroup;
  service: Service;
  userId: string;
  priority: PriorityTag[];
  source: TokenSource;
  bookingId: string | null;
}

function issueToken(db: MockDb, n: NewToken, now: EpochMs): MockTokenRow {
  const counters = Math.max(1, n.branch.counters.filter((c) => c.groupIds.includes(n.group.id)).length);
  const waiting = ambientWaiting(n.branch.id, n.service.id, now);
  const ahead = aheadForNewToken(waiting, { priority: n.priority, source: n.source });
  const number = nextNumber(db, n.branch, n.group.id, now);
  const row: MockTokenRow = {
    id: uid("tok"),
    code: formatTokenCode(n.group.tokenPrefix, number),
    number,
    branchId: n.branch.id,
    serviceId: n.service.id,
    groupId: n.group.id,
    userId: n.userId,
    source: n.source,
    priority: n.priority,
    joinedAt: now,
    aheadAtJoin: ahead,
    delayPositions: 0,
    lapseCount: 0,
    checkinPromptedAt: null,
    checkinConfirmedAt: null,
    calledAt: null,
    counter: null,
    onMyWayAt: null,
    extraTimeMs: 0,
    extensionCount: 0,
    servingStartedAt: null,
    servedAt: null,
    missedAt: null,
    leftAt: null,
    feedback: null,
    reconciledAt: now,
    bookingId: n.bookingId,
    ...paceFor(devSettings().speed, n.service.avgServiceMin, counters),
  };
  db.tokens[row.id] = row;
  return syncRow(db, row, now).row;
}

function requireNoActive(db: MockDb, userId: string, now: EpochMs) {
  syncUserTokens(db, userId, now);
  const active = userRows(db, userId).find((r) => isActiveStage(stageOf(r, ctxFor(r), now)));
  if (active) throw new DomainError("already_in_queue", undefined, { tokenId: active.id, code: active.code });
}

function ownRow(db: MockDb, userId: string, ref: TokenRef): MockTokenRow {
  const rows = userRows(db, userId);
  const row =
    "id" in ref
      ? rows.find((r) => r.id === ref.id)
      : rows.filter((r) => r.code.toLowerCase() === ref.code.toLowerCase()).sort((a, b) => b.joinedAt - a.joinedAt)[0];
  if (!row) throw new DomainError("token_not_found");
  return row;
}

function assertAtBranch(row: MockTokenRow, proof: LocationProof, now: EpochMs) {
  const branch = branchById(row.branchId, now);
  if (!branch) throw new DomainError("branch_not_found");
  assertWithinBranch(proof, branch, now);
}

/** Apply a domain action to a token, persist it, and return the fresh view. */
function act(ref: TokenRef, fn: (row: MockTokenRow, now: EpochMs) => TokenRecord): TokenView {
  const now = clock.now();
  return mutate((db) => {
    const user = currentUser(db, now);
    const row = ownRow(db, user.id, ref);
    const record = fn(row, now);
    const next: MockTokenRow = { ...row, ...record };
    db.tokens[row.id] = next;
    return viewOf(next, now);
  });
}

export function createQueueService(): QueueService {
  return {
    async active() {
      const now = clock.now();
      const db = loadDb();
      let user;
      try {
        user = currentUser(db, now);
      } catch {
        return null;
      }
      const rows = userRows(db, user.id)
        .map((r) => (r.servedAt != null || r.missedAt != null || r.leftAt != null ? r : syncRow(db, r, now).row))
        .filter((r) => isActiveStage(stageOf(r, ctxFor(r), now)))
        .sort((a, b) => b.joinedAt - a.joinedAt);
      return rows[0] ? viewOf(rows[0], now) : null;
    },

    async get(ref) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const row = ownRow(db, user.id, ref);
        return viewOf(syncRow(db, row, now).row, now);
      });
    },

    async join(input) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const branch = branchById(input.branchId, now);
        if (!branch) throw new DomainError("branch_not_found");
        const found = findService(input.serviceId);
        if (!found) throw new DomainError("service_not_found");
        if (!isBranchOpen(branch, now)) throw new DomainError("branch_closed");
        assertWithinBranch(input.proof, branch, now);
        requireNoActive(db, user.id, now);
        const row = issueToken(
          db,
          { branch, group: found.group, service: found.service, userId: user.id, priority: input.priority, source: "walk_in", bookingId: null },
          now,
        );
        return viewOf(row, now);
      });
    },

    async checkInBooking({ bookingId, proof }) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const booking = db.bookings[bookingId];
        if (!booking || booking.userId !== user.id) throw new DomainError("booking_not_found");
        if (booking.status !== "upcoming") throw new DomainError("invalid_state", "This booking cannot be checked in");
        if (!canCheckInBooking(booking.startsAt, now, DEFAULT_POLICY)) throw new DomainError("booking_window");
        const branch = branchById(booking.branchId, now);
        const found = findService(booking.serviceId);
        if (!branch || !found) throw new DomainError("branch_not_found");
        assertWithinBranch(proof, branch, now);
        requireNoActive(db, user.id, now);
        const row = issueToken(
          db,
          { branch, group: found.group, service: found.service, userId: user.id, priority: user.priority, source: "booking", bookingId },
          now,
        );
        db.bookings[bookingId] = { ...booking, status: "checked_in", tokenId: row.id };
        return viewOf(row, now);
      });
    },

    async confirmCheckin(id, proof) {
      return act({ id }, (row, now) => {
        assertAtBranch(row, proof, now);
        return confirmCheckin(row, ctxFor(row), now).record;
      });
    },
    async moveBack(id) {
      return act({ id }, (row, now) => moveBack(row, ctxFor(row), now).record);
    },
    async onMyWay(id) {
      return act({ id }, (row, now) => markOnMyWay(row, ctxFor(row), now).record);
    },
    async requestMoreTime(id) {
      return act({ id }, (row, now) => requestMoreTime(row, ctxFor(row), now).record);
    },
    async leave(id) {
      return act({ id }, (row, now) => leaveQueue(row, ctxFor(row), now).record);
    },
    async sendFeedback(id, feedback) {
      return act({ id }, (row, now) => {
        const synced = reconcile(row, ctxFor(row), now).record;
        if (synced.servedAt == null) throw new DomainError("invalid_state", "Feedback opens after your visit");
        return { ...synced, feedback };
      });
    },

    subscribe(onChange) {
      let last = "";
      const tick = () => {
        const now = clock.now();
        const db = loadDb();
        const s = db.session;
        if (!s) {
          if (last !== "none") {
            last = "none";
            onChange();
          }
          return;
        }
        const changed = syncUserTokens(db, s.userId, now);
        if (changed) mutate((fresh) => syncUserTokens(fresh, s.userId, now));
        const sig = userRows(loadDb(), s.userId)
          .filter((r) => isActiveStage(stageOf(r, ctxFor(r), now)))
          .map((r) => `${r.id}:${stageOf(r, ctxFor(r), now)}:${Math.max(0, r.aheadAtJoin + r.delayPositions - Math.floor((now - r.joinedAt) / r.stepMs))}:${r.delayPositions}:${r.extraTimeMs}:${r.onMyWayAt ?? 0}`)
          .join("|");
        if (sig !== last) {
          last = sig;
          onChange();
        }
      };
      const timer = setInterval(tick, 1000);
      const off = onDbChange(() => {
        last = "";
        tick();
      });
      tick();
      return () => {
        clearInterval(timer);
        off();
      };
    },
  };
}
