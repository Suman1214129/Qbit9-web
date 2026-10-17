import {
  DEFAULT_POLICY, DomainError, bookingWindows, buildAvailability, canCancelBooking, canCheckInBooking,
  type Booking, type BookingView, type EpochMs, type ID,
} from "@/domain";
import { clock } from "@/lib/clock";
import { currentUser } from "./auth";
import { countersFor, findService, hash } from "./catalogue";
import { branchById } from "./engine";
import { loadDb, mutate, uid, type MockDb } from "./db";
import type { BookingService } from "../types";

/** Seat pressure from other customers: some slots are already half or fully taken. */
function otherCustomers(branchId: ID, groupId: ID, startsAt: EpochMs, capacity: number): number {
  const h = hash(`${branchId}|${groupId}|${startsAt}`) % 10;
  return h < 2 ? capacity : h < 4 ? Math.min(1, capacity) : 0;
}

function bookedAt(db: MockDb, branchId: ID, groupId: ID, startsAt: EpochMs): number {
  return Object.values(db.bookings).filter((b) => {
    if (b.branchId !== branchId || b.startsAt !== startsAt) return false;
    if (b.status === "cancelled" || b.status === "missed") return false;
    return findService(b.serviceId)?.group.id === groupId;
  }).length;
}

/** Settle bookings that ended on their own: not checked in before the hold ran out, or token served. */
function settle(db: MockDb, userId: ID, now: EpochMs): void {
  for (const b of Object.values(db.bookings)) {
    if (b.userId !== userId) continue;
    if (b.status === "upcoming" && now > bookingWindows(b.startsAt, DEFAULT_POLICY).holdsUntil) db.bookings[b.id] = { ...b, status: "missed" };
    if (b.status === "checked_in" && b.tokenId && db.tokens[b.tokenId]?.servedAt != null) db.bookings[b.id] = { ...b, status: "completed" };
  }
}

function toView(b: Booking, now: EpochMs): BookingView {
  const branch = branchById(b.branchId, now);
  const found = findService(b.serviceId);
  return {
    ...b,
    branchName: branch?.name ?? "Branch",
    serviceName: found?.service.name ?? "Service",
    bring: found?.service.bring ?? [],
    canCheckIn: b.status === "upcoming" && canCheckInBooking(b.startsAt, now),
    canCancel: b.status === "upcoming" && canCancelBooking(b.startsAt, now),
  };
}

export function createBookingService(): BookingService {
  return {
    async availability(branchId, serviceId) {
      const now = clock.now();
      const branch = branchById(branchId, now);
      if (!branch) throw new DomainError("branch_not_found");
      const found = findService(serviceId);
      if (!found || !found.service.bookable) throw new DomainError("service_not_found");
      const capacity = Math.max(1, countersFor(branch, found.group.id).length);
      const db = loadDb();
      return buildAvailability({
        branch,
        now,
        capacity,
        taken: (t) => otherCustomers(branchId, found.group.id, t, capacity) + bookedAt(db, branchId, found.group.id, t),
      });
    },

    async list() {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        settle(db, user.id, now);
        return Object.values(db.bookings)
          .filter((b) => b.userId === user.id)
          .sort((a, b) => a.startsAt - b.startsAt)
          .map((b) => toView(b, now));
      });
    },

    async get(id) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        settle(db, user.id, now);
        const b = db.bookings[id];
        if (!b || b.userId !== user.id) throw new DomainError("booking_not_found");
        return toView(b, now);
      });
    },

    async create({ branchId, serviceId, startsAt }) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const branch = branchById(branchId, now);
        if (!branch) throw new DomainError("branch_not_found");
        const found = findService(serviceId);
        if (!found || !found.service.bookable) throw new DomainError("service_not_found");
        const capacity = Math.max(1, countersFor(branch, found.group.id).length);
        const days = buildAvailability({
          branch,
          now,
          capacity,
          taken: (t) => otherCustomers(branchId, found.group.id, t, capacity) + bookedAt(db, branchId, found.group.id, t),
        });
        const slot = days.flatMap((d) => d.slots).find((s) => s.startsAt === startsAt);
        if (!slot) throw new DomainError("booking_window");
        if (slot.status === "past") throw new DomainError("slot_in_past");
        if (slot.status === "full") throw new DomainError("slot_unavailable");
        const clash = Object.values(db.bookings).some((b) => b.userId === user.id && b.status === "upcoming" && b.startsAt === startsAt);
        if (clash) throw new DomainError("slot_unavailable", "You already have a booking at this time");
        const booking: Booking = {
          id: uid("bk"),
          userId: user.id,
          branchId,
          serviceId,
          startsAt,
          durationMin: found.service.avgServiceMin,
          status: "upcoming",
          createdAt: now,
          tokenId: null,
        };
        db.bookings[booking.id] = booking;
        return toView(booking, now);
      });
    },

    async cancel(id) {
      const now = clock.now();
      return mutate((db) => {
        const user = currentUser(db, now);
        const b = db.bookings[id];
        if (!b || b.userId !== user.id) throw new DomainError("booking_not_found");
        if (b.status !== "upcoming" || !canCancelBooking(b.startsAt, now)) throw new DomainError("booking_not_cancellable");
        const next: Booking = { ...b, status: "cancelled" };
        db.bookings[id] = next;
        return toView(next, now);
      });
    },
  };
}
