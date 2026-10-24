import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { clock } from "@/lib/clock";
import { resetDb } from "./mock/db";
import { createMockServices } from "./mock";
import { createSupabaseBookingService } from "./supabase/bookings";
import type { BookingService } from "./types";

const TEST_START_TIME = 1_700_000_000_000 + 24 * 3600_000; // Tomorrow

interface MockDbBooking {
  id: string;
  user_id: string;
  branch_id: string;
  service_id: string;
  starts_at: string;
  duration_min: number;
  status: string;
  token_id: string | null;
  created_at: string;
}

function createTestSupabaseBookingClient() {
  const currentUser: SupabaseAuthUser | null = {
    id: "user_test_booking",
    email: "booking@example.com",
  } as SupabaseAuthUser;

  const bookings = new Map<string, MockDbBooking>();
  let idCounter = 1;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: null,
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "create_booking") {
        if (!currentUser) return { data: null, error: new Error("not_signed_in") };

        const startsAtMs = new Date(String(args.p_starts_at)).getTime();
        const now = clock.now();
        if (startsAtMs <= now + 30 * 60_000) {
          return { data: null, error: new Error("slot_in_past") };
        }

        let taken = 0;
        for (const b of bookings.values()) {
          if (b.branch_id === String(args.p_branch_id) && b.starts_at === String(args.p_starts_at) && b.status === "upcoming") {
            taken += 1;
            if (b.user_id === currentUser.id) return { data: null, error: new Error("slot_unavailable") };
          }
        }
        if (taken >= 2) {
          return { data: null, error: new Error("slot_unavailable") };
        }

        const id = `bk_${idCounter++}`;
        const row: MockDbBooking = {
          id,
          user_id: currentUser.id,
          branch_id: String(args.p_branch_id),
          service_id: String(args.p_service_id),
          starts_at: String(args.p_starts_at),
          duration_min: 18,
          status: "upcoming",
          token_id: null,
          created_at: new Date(now).toISOString(),
        };
        bookings.set(id, row);
        return { data: id, error: null };
      }

      if (fn === "cancel_booking") {
        const id = String(args.p_booking_id);
        const b = bookings.get(id);
        if (!b) return { data: null, error: new Error("booking_not_found") };
        if (b.status !== "upcoming") return { data: null, error: new Error("booking_not_cancellable") };
        bookings.set(id, { ...b, status: "cancelled" });
        return { data: true, error: null };
      }

      return { data: null, error: new Error(`unknown rpc ${fn}`) };
    },
    from: (table: string) => {
      let filterCol: string | null = null;
      let filterVal: unknown = null;
      const builder = {
        select: (_fields?: string) => builder,
        eq: (col: string, val: unknown) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        order: (_col: string, _opts: unknown) => builder,
        maybeSingle: async () => {
          if (table === "branches") {
            return {
              data: {
                id: "br_sbi_main_road",
                name: "Main Road Branch",
                timezone: "Asia/Kolkata",
                hours: [
                  null,
                  { open: "10:00", close: "16:00" },
                  { open: "10:00", close: "16:00" },
                  { open: "10:00", close: "16:00" },
                  { open: "10:00", close: "16:00" },
                  { open: "10:00", close: "16:00" },
                  { open: "10:00", close: "14:00" },
                ],
                closed_dates: [],
              },
              error: null,
            };
          }
          if (table === "services") {
            return {
              data: {
                id: "svc_open",
                group_id: "grp_accounts",
                name: "Open an account",
                avg_service_min: 18,
                bookable: true,
                bring: ["Aadhaar card", "PAN card"],
              },
              error: null,
            };
          }
          if (table === "bookings") {
            if (filterCol === "id") {
              const b = bookings.get(String(filterVal));
              return { data: b ?? null, error: null };
            }
          }
          return { data: null, error: null };
        },
        then: (resolve: (res: unknown) => void) => {
          if (table === "counters") {
            return resolve({ data: [{ id: "c1" }, { id: "c2" }], error: null });
          }
          if (table === "slot_capacity") {
            return resolve({ data: [], error: null });
          }
          if (table === "bookings") {
            const list = Array.from(bookings.values()).filter((b) => b.user_id === currentUser?.id);
            return resolve({ data: list, error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
    _bookings: bookings,
  };

  return client as unknown as SupabaseClient & {
    _bookings: Map<string, MockDbBooking>;
  };
}

describe("BookingService Contract Suite", () => {
  const branchId = "br_sbi_main_road";
  const serviceId = "svc_open";

  beforeEach(() => {
    localStorage.clear();
    resetDb();
    vi.setSystemTime(1_700_000_000_000);
  });

  describe("Mock Implementation", () => {
    let mockServices: ReturnType<typeof createMockServices>;
    let bookings: BookingService;

    beforeEach(async () => {
      mockServices = createMockServices({ devtools: false });
      bookings = mockServices.bookings;
      const ch = await mockServices.auth.requestOtp("phone", "9876543210");
      await mockServices.auth.verifyOtp({
        channel: "phone",
        identifier: "9876543210",
        code: ch.debugCode ?? "4321",
        name: "Test User",
        remember: true,
      });
    });

    it("fetches availability for branch and service", async () => {
      const days = await bookings.availability(branchId, serviceId);
      expect(days.length).toBeGreaterThan(0);
      expect(days[0]?.slots.length).toBeGreaterThan(0);
    });

    it("creates, retrieves, lists, and cancels a booking", async () => {
      const days = await bookings.availability(branchId, serviceId);
      const openDay = days.find((d) => d.open);
      const freeSlot = openDay?.slots.find((s) => s.status === "free");
      expect(freeSlot).toBeDefined();

      const created = await bookings.create({
        branchId,
        serviceId,
        startsAt: freeSlot!.startsAt,
      });

      expect(created.status).toBe("upcoming");
      expect(created.startsAt).toBe(freeSlot!.startsAt);

      const fetched = await bookings.get(created.id);
      expect(fetched.id).toBe(created.id);

      const list = await bookings.list();
      expect(list.some((b) => b.id === created.id)).toBe(true);

      const cancelled = await bookings.cancel(created.id);
      expect(cancelled.status).toBe("cancelled");
    });
  });

  describe("Supabase Implementation", () => {
    let client: ReturnType<typeof createTestSupabaseBookingClient>;
    let bookings: BookingService;

    beforeEach(() => {
      client = createTestSupabaseBookingClient();
      bookings = createSupabaseBookingService(client);
    });

    it("fetches availability for branch and service", async () => {
      const days = await bookings.availability(branchId, serviceId);
      expect(days.length).toBeGreaterThan(0);
      expect(days[0]?.slots.length).toBeGreaterThan(0);
    });

    it("creates, retrieves, lists, and cancels a booking", async () => {
      const startsAt = TEST_START_TIME;
      const created = await bookings.create({
        branchId,
        serviceId,
        startsAt,
      });

      expect(created.status).toBe("upcoming");
      expect(created.startsAt).toBe(startsAt);

      const fetched = await bookings.get(created.id);
      expect(fetched.id).toBe(created.id);

      const list = await bookings.list();
      expect(list.some((b) => b.id === created.id)).toBe(true);

      const cancelled = await bookings.cancel(created.id);
      expect(cancelled.status).toBe("cancelled");
    });

    it("enforces slot capacity locking", async () => {
      const startsAt = TEST_START_TIME;
      await bookings.create({ branchId, serviceId, startsAt });

      // Creating second time with same user fails
      await expect(
        bookings.create({ branchId, serviceId, startsAt }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "slot_unavailable" }),
      );
    });
  });
});
