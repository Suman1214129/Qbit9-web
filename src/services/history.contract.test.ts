import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { resetDb } from "./mock/db";
import { createMockServices } from "./mock";
import { createSupabaseHistoryService } from "./supabase/history";
import type { HistoryService } from "./types";

function createTestSupabaseHistoryClient() {
  const currentUser: SupabaseAuthUser = {
    id: "user_test_history",
    email: "history@example.com",
  } as SupabaseAuthUser;

  const client = {
    auth: {
      getUser: async () => ({
        data: { user: currentUser },
        error: null,
      }),
    },
    from: (table: string) => {
      const builder = {
        select: (_fields?: string) => builder,
        eq: (_col: string, _val: unknown) => builder,
        order: (_col: string, _opts: unknown) => builder,
        then: (resolve: (res: unknown) => void) => {
          if (table === "tokens") {
            return resolve({
              data: [
                {
                  id: "tok_hist_1",
                  code: "C-011",
                  number: 11,
                  branch_id: "br_sbi_main_road",
                  service_id: "svc_open",
                  group_id: "grp_accounts",
                  user_id: currentUser.id,
                  source: "walk_in",
                  priority: [],
                  joined_at: new Date(1_700_000_000_000 - 3600_000).toISOString(),
                  ahead_at_join: 5,
                  delay_positions: 0,
                  lapse_count: 0,
                  called_at: new Date(1_700_000_000_000 - 2400_000).toISOString(),
                  served_at: new Date(1_700_000_000_000 - 1800_000).toISOString(),
                  reconciled_at: new Date(1_700_000_000_000).toISOString(),
                  booking_id: null,
                },
              ],
              error: null,
            });
          }
          if (table === "bookings") {
            return resolve({
              data: [
                {
                  id: "bk_hist_1",
                  user_id: currentUser.id,
                  branch_id: "br_sbi_main_road",
                  service_id: "svc_open",
                  starts_at: new Date(1_700_000_000_000 + 7200_000).toISOString(),
                  duration_min: 18,
                  status: "upcoming",
                  token_id: null,
                  created_at: new Date(1_700_000_000_000).toISOString(),
                },
              ],
              error: null,
            });
          }
          if (table === "branches") {
            return resolve({
              data: [{ id: "br_sbi_main_road", name: "Main Road Branch" }],
              error: null,
            });
          }
          if (table === "services") {
            return resolve({
              data: [{ id: "svc_open", name: "Open an account", group_id: "grp_accounts", avg_service_min: 18 }],
              error: null,
            });
          }
          if (table === "counters") {
            return resolve({
              data: [{ id: "c1", branch_id: "br_sbi_main_road" }],
              error: null,
            });
          }
          return resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  };

  return client as unknown as SupabaseClient;
}

describe("HistoryService Contract Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDb();
    vi.setSystemTime(1_700_000_000_000);
  });

  describe("Mock Implementation", () => {
    let mockServices: ReturnType<typeof createMockServices>;
    let history: HistoryService;

    beforeEach(async () => {
      mockServices = createMockServices({ devtools: false });
      history = mockServices.history;
      const ch = await mockServices.auth.requestOtp("phone", "9876543210");
      await mockServices.auth.verifyOtp({
        channel: "phone",
        identifier: "9876543210",
        code: ch.debugCode ?? "4321",
        name: "Test User",
        remember: true,
      });
    });

    it("returns items and stats object", async () => {
      const page = await history.list();
      expect(page).toBeDefined();
      expect(Array.isArray(page.items)).toBe(true);
      expect(page.stats).toBeDefined();
      expect(typeof page.stats.visits).toBe("number");
    });
  });

  describe("Supabase Implementation", () => {
    let client: SupabaseClient;
    let history: HistoryService;

    beforeEach(() => {
      client = createTestSupabaseHistoryClient();
      history = createSupabaseHistoryService(client);
    });

    it("returns items and calculates history stats", async () => {
      const page = await history.list();
      expect(page).toBeDefined();
      expect(page.items.length).toBe(2);
      expect(page.stats.visits).toBe(1); // One served token
      expect(page.items[0]?.branchName).toBe("Main Road Branch");
    });
  });
});
