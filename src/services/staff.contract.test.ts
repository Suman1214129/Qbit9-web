import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resetDb } from "./mock/db";
import { resetFloor } from "./mock/staff/store";
import { createMockServices } from "./mock";
import { createSupabaseStaffService } from "./supabase/staff";
import type { StaffService } from "./staff-types";

function createTestSupabaseStaffClient() {
  let failedAttempts = 0;
  let locked = false;

  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "staff_sign_in") {
        if (locked) return { data: null, error: new Error("account_locked") };

        const pin = String(args.p_pin);
        if (pin !== "4821") {
          failedAttempts += 1;
          if (failedAttempts >= 5) {
            locked = true;
            return { data: null, error: new Error("account_locked") };
          }
          return { data: null, error: new Error("invalid_credentials") };
        }

        failedAttempts = 0;
        return {
          data: {
            id: "staff_e48213",
            employee_id: "E48213",
            name: "Meera Patel",
            branch_id: "br_sbi_main_road",
            role: "teller",
          },
          error: null,
        };
      }

      if (fn === "staff_call_next") {
        return { data: "tok_test_next", error: null };
      }

      if (fn === "staff_recall") {
        return { data: true, error: null };
      }

      if (fn === "staff_transfer") {
        return { data: true, error: null };
      }

      if (fn === "staff_finish_current") {
        return { data: true, error: null };
      }

      return { data: null, error: new Error(`unknown rpc ${fn}`) };
    },
    from: (table: string) => {
      const builder = {
        select: (_fields?: string) => builder,
        eq: (_col: string, _val: unknown) => builder,
        maybeSingle: async () => {
          if (table === "branches") {
            return {
              data: {
                id: "br_sbi_main_road",
                name: "Main Road Branch",
                timezone: "Asia/Kolkata",
                banks: { name: "State Bank of India", short_name: "SBI" },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return builder;
    },
  };

  return client as unknown as SupabaseClient;
}

describe("StaffService Contract Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    resetDb();
    resetFloor();
    vi.setSystemTime(1_700_000_000_000);
  });

  describe("Mock Implementation", () => {
    let mockServices: ReturnType<typeof createMockServices>;
    let staff: StaffService;

    beforeEach(() => {
      mockServices = createMockServices({ devtools: false });
      staff = mockServices.staff!;
    });

    it("signs in with valid employee ID and PIN", async () => {
      const session = await staff.signIn({
        employeeId: "E48213",
        pin: "4821",
      });

      expect(session).toBeDefined();
      expect(session.staff.employeeId).toBe("E48213");
      expect(session.staff.name).toContain("Meera");
    });

    it("rejects invalid PIN", async () => {
      await expect(
        staff.signIn({
          employeeId: "E48213",
          pin: "0000",
        }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "invalid_credentials" }),
      );
    });

    it("manages shift lifecycle", async () => {
      await staff.signIn({ employeeId: "E48213", pin: "4821" });

      const started = await staff.startShift(4);
      expect(started.shift.status).toBe("open");
      expect(started.counter.number).toBe(4);

      const onBreak = await staff.startBreak("tea");
      expect(onBreak.shift.status).toBe("break");
      expect(onBreak.onBreak?.reason).toBe("tea");

      const resumed = await staff.resumeFromBreak();
      expect(resumed.shift.status).toBe("open");
    });
  });

  describe("Supabase Implementation", () => {
    let client: SupabaseClient;
    let staff: StaffService;

    beforeEach(() => {
      client = createTestSupabaseStaffClient();
      staff = createSupabaseStaffService(client);
    });

    it("signs in with valid employee ID and PIN", async () => {
      const session = await staff.signIn({
        employeeId: "E48213",
        pin: "4821",
      });

      expect(session).toBeDefined();
      expect(session.staff.employeeId).toBe("E48213");
      expect(session.staff.name).toBe("Meera Patel");
    });

    it("rejects invalid PIN and locks after 5 attempts", async () => {
      for (let i = 0; i < 4; i++) {
        await expect(
          staff.signIn({ employeeId: "E48213", pin: "0000" }),
        ).rejects.toThrowError(
          expect.objectContaining({ code: "invalid_credentials" }),
        );
      }

      await expect(
        staff.signIn({ employeeId: "E48213", pin: "0000" }),
      ).rejects.toThrowError(
        expect.objectContaining({ code: "account_locked" }),
      );
    });

    it("manages shift lifecycle", async () => {
      await staff.signIn({ employeeId: "E48213", pin: "4821" });

      const started = await staff.startShift(2);
      expect(started.shift.status).toBe("open");
      expect(started.counter.number).toBe(2);

      const onBreak = await staff.startBreak("lunch");
      expect(onBreak.shift.status).toBe("break");
      expect(onBreak.onBreak?.reason).toBe("lunch");

      const resumed = await staff.resumeFromBreak();
      expect(resumed.shift.status).toBe("open");

      const callResult = await staff.callNext();
      expect(callResult).toBeDefined();
    });
  });
});
