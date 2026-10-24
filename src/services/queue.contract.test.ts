import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import {
  type LocationProof,
} from "@/domain";
import { clock } from "@/lib/clock";
import { createMockServices } from "./mock";
import { createSupabaseQueueService } from "./supabase/queue";
import type { QueueService } from "./types";

const MOCK_PROOF_VALID: LocationProof = {
  lat: 23.0225,
  lng: 72.5714,
  accuracyM: 25,
  capturedAt: 1_700_000_000_000,
};

const MOCK_PROOF_FAR: LocationProof = {
  lat: 28.6139,
  lng: 77.209,
  accuracyM: 20,
  capturedAt: 1_700_000_000_000,
};

const MOCK_PROOF_INACCURATE: LocationProof = {
  lat: 23.0225,
  lng: 72.5714,
  accuracyM: 5000,
  capturedAt: 1_700_000_000_000,
};

const MOCK_PROOF_STALE: LocationProof = {
  lat: 23.0225,
  lng: 72.5714,
  accuracyM: 25,
  capturedAt: 1_700_000_000_000 - 800_000,
};

interface TestTokenRecord {
  id: string;
  code: string;
  number: number;
  branch_id: string;
  group_id: string;
  service_id: string;
  user_id: string | null;
  source: string;
  priority: string[];
  stage: string;
  ahead: number;
  position: number;
  now_serving_code: string | null;
  counter: number | null;
  counter_is_assigned: boolean;
  joined_at: number;
  called_at: number | null;
  call_deadline: number | null;
  checkin_deadline: number | null;
  can_request_more_time: boolean;
  on_my_way: boolean;
  served_at: number | null;
  waited_ms: number | null;
  saved_ms: number | null;
  feedback: string | null;
  bring: string[];
  avg_service_min: number;
  counters: number;
  ahead_at_join: number;
  moved_back: number;
  extension_count: number;
}

function createTestSupabaseQueueClient() {
  let currentUser: SupabaseAuthUser | null = {
    id: "user_test_queue",
    email: "queue@example.com",
  } as SupabaseAuthUser;

  const tokens = new Map<string, TestTokenRecord>();
  let seqCounter = 40;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: null,
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "join_queue") {
        if (!currentUser) return { data: null, error: new Error("not_signed_in") };

        // check active token
        for (const t of tokens.values()) {
          if (t.user_id === currentUser.id && ["waiting", "checkin", "called", "serving"].includes(t.stage)) {
            return { data: null, error: new Error("already_in_queue") };
          }
        }

        const lat = Number(args.p_proof_lat);
        const accuracy = Number(args.p_proof_accuracy);
        const capturedAt = Number(args.p_proof_captured_at);
        const now = clock.now();

        if (now - capturedAt > 600000 || capturedAt - now > 60000) {
          return { data: null, error: new Error("location_stale") };
        }
        if (accuracy > 150) {
          return { data: null, error: new Error("location_inaccurate") };
        }
        if (Math.abs(lat - 23.0225) > 0.05) {
          return { data: null, error: new Error("too_far") };
        }

        seqCounter += 1;
        const tokenId = `tok_${seqCounter}`;
        const code = `C-0${seqCounter}`;
        const record: TestTokenRecord = {
          id: tokenId,
          code,
          number: seqCounter,
          branch_id: String(args.p_branch_id),
          service_id: String(args.p_service_id),
          group_id: "accounts",
          user_id: currentUser.id,
          source: "walk_in",
          priority: (args.p_priority as string[]) ?? [],
          stage: "waiting",
          ahead: 0,
          position: 1,
          now_serving_code: null,
          counter: null,
          counter_is_assigned: false,
          joined_at: now,
          called_at: null,
          call_deadline: null,
          checkin_deadline: null,
          can_request_more_time: true,
          on_my_way: false,
          served_at: null,
          waited_ms: null,
          saved_ms: null,
          feedback: null,
          bring: ["PAN card", "Aadhaar"],
          avg_service_min: 15,
          counters: 2,
          ahead_at_join: 0,
          moved_back: 0,
          extension_count: 0,
        };
        tokens.set(tokenId, record);
        return { data: tokenId, error: null };
      }

      if (fn === "confirm_checkin") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        const accuracy = Number(args.p_proof_accuracy);
        if (accuracy > 150) return { data: null, error: new Error("location_inaccurate") };
        tokens.set(tokenId, { ...t, stage: "waiting" });
        return { data: true, error: null };
      }

      if (fn === "move_back") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        tokens.set(tokenId, {
          ...t,
          moved_back: t.moved_back + 3,
          ahead: t.ahead + 3,
          position: t.position + 3,
        });
        return { data: true, error: null };
      }

      if (fn === "on_my_way") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        tokens.set(tokenId, { ...t, on_my_way: true });
        return { data: true, error: null };
      }

      if (fn === "request_more_time") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        if (t.extension_count >= 1) return { data: null, error: new Error("no_more_time") };
        tokens.set(tokenId, {
          ...t,
          extension_count: t.extension_count + 1,
          can_request_more_time: false,
        });
        return { data: true, error: null };
      }

      if (fn === "leave_queue") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        tokens.set(tokenId, { ...t, stage: "left" });
        return { data: true, error: null };
      }

      if (fn === "send_token_feedback") {
        const tokenId = String(args.p_token_id);
        const t = tokens.get(tokenId);
        if (!t) return { data: null, error: new Error("token_not_found") };
        tokens.set(tokenId, { ...t, feedback: String(args.p_feedback) });
        return { data: true, error: null };
      }

      return { data: null, error: new Error(`unknown rpc ${fn}`) };
    },
    from: (_table: string) => {
      let filterCol: string | null = null;
      let filterVal: unknown = null;
      const builder = {
        select: (_fields?: string) => builder,
        eq: (col: string, val: unknown) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        ilike: (col: string, val: string) => {
          filterCol = col;
          filterVal = val;
          return builder;
        },
        in: (_col: string, _vals: string[]) => builder,
        order: (_col: string, _opts: unknown) => builder,
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          if (filterCol === "id") {
            const t = tokens.get(String(filterVal));
            return { data: t ?? null, error: null };
          }
          if (filterCol === "code") {
            for (const t of tokens.values()) {
              if (t.code.toLowerCase() === String(filterVal).toLowerCase()) {
                return { data: t, error: null };
              }
            }
          }
          if (filterCol === "user_id") {
            for (const t of tokens.values()) {
              if (t.user_id === String(filterVal) && ["waiting", "checkin", "called", "serving"].includes(t.stage)) {
                return { data: t, error: null };
              }
            }
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
    channel: (_name: string) => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: async () => {},
    _tokens: tokens,
    _setUser: (user: SupabaseAuthUser | null) => {
      currentUser = user;
    },
  };

  return client as unknown as SupabaseClient & {
    _tokens: Map<string, TestTokenRecord>;
    _setUser: (user: SupabaseAuthUser | null) => void;
  };
}

import { resetDb } from "./mock/db";

describe("QueueService Contract Suite", () => {
  const branchId = "br_sbi_main_road";
  const serviceId = "svc_open";

  beforeEach(() => {
    localStorage.clear();
    resetDb();
    vi.setSystemTime(1_700_000_000_000);
  });

  describe("Mock Implementation", () => {
    let mockServices: ReturnType<typeof createMockServices>;
    let queue: QueueService;

    beforeEach(async () => {
      mockServices = createMockServices({ devtools: false });
      queue = mockServices.queue;
      const ch = await mockServices.auth.requestOtp("phone", "9876543210");
      await mockServices.auth.verifyOtp({
        channel: "phone",
        identifier: "9876543210",
        code: ch.debugCode ?? "4321",
        name: "Test User",
        remember: true,
      });
    });

    it("joins with valid location proof and retrieves active token", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      expect(token).toBeDefined();
      expect(token.code).toMatch(/^[A-Z]-\d{3}$/);
      expect(token.stage).toBe("waiting");

      const active = await queue.active();
      expect(active?.id).toBe(token.id);
    });

    it("prevents double-joining when already in queue", async () => {
      await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_VALID,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "already_in_queue" }),
      );
    });

    it("rejects joining when too far", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_FAR,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "too_far" }),
      );
    });

    it("rejects joining when location accuracy is too low", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_INACCURATE,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "location_inaccurate" }),
      );
    });

    it("rejects joining when proof is stale", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_STALE,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "location_stale" }),
      );
    });

    it("moves back in line on request", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      const updated = await queue.moveBack(token.id);
      expect(updated.movedBack).toBeGreaterThan(0);
    });

    it("allows customer to leave queue", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      const updated = await queue.leave(token.id);
      expect(updated.stage).toBe("left");

      const active = await queue.active();
      expect(active).toBeNull();
    });
  });

  describe("Supabase Implementation", () => {
    let client: ReturnType<typeof createTestSupabaseQueueClient>;
    let queue: QueueService;

    beforeEach(() => {
      client = createTestSupabaseQueueClient();
      queue = createSupabaseQueueService(client);
    });

    it("joins with valid location proof and retrieves active token", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      expect(token).toBeDefined();
      expect(token.code).toMatch(/^[A-Z]-\d{3}$/);
      expect(token.stage).toBe("waiting");

      const active = await queue.active();
      expect(active?.id).toBe(token.id);
    });

    it("prevents double-joining when already in queue", async () => {
      await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_VALID,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "already_in_queue" }),
      );
    });

    it("rejects joining when too far", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_FAR,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "too_far" }),
      );
    });

    it("rejects joining when accuracy is low", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_INACCURATE,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "location_inaccurate" }),
      );
    });

    it("rejects joining when proof is stale", async () => {
      await expect(
        queue.join({
          branchId,
          serviceId,
          priority: [],
          proof: MOCK_PROOF_STALE,
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "location_stale" }),
      );
    });

    it("moves back in line on request", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      const updated = await queue.moveBack(token.id);
      expect(updated.movedBack).toBe(3);
    });

    it("marks on my way and limits extra time", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      const onWay = await queue.onMyWay(token.id);
      expect(onWay.onMyWay).toBe(true);

      const moreTime = await queue.requestMoreTime(token.id);
      expect(moreTime.canRequestMoreTime).toBe(false);

      await expect(queue.requestMoreTime(token.id)).rejects.toThrowError(
        expect.objectContaining({ code: "no_more_time" }),
      );
    });

    it("allows customer to leave queue and record feedback", async () => {
      const token = await queue.join({
        branchId,
        serviceId,
        priority: [],
        proof: MOCK_PROOF_VALID,
      });

      const left = await queue.leave(token.id);
      expect(left.stage).toBe("left");

      const withFeedback = await queue.sendFeedback(token.id, "quick");
      expect(withFeedback.feedback).toBe("quick");
    });
  });
});
