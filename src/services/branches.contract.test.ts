import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "@/domain";
import { createMockServices } from "@/services/mock";
import { createBranchService as createSupabaseBranchService } from "@/services/supabase/branches";
import type { BranchService } from "@/services/types";
import { BANKS, GROUPS, getBranches } from "@/services/mock/catalogue";

/**
 * Creates a mock Supabase client seeded with the Phase 1 catalogue and views data.
 * This allows contract testing the Supabase BranchService adapter in unit test environments.
 */
function createTestSupabaseClient(): SupabaseClient {
  const now = 1774000000000;
  const branches = getBranches(now);

  const branchesRows = branches.map((b) => ({
    id: b.id,
    bank_id: b.bankId,
    slug: b.slug,
    name: b.name,
    address: b.address,
    area: b.area,
    city: b.city,
    lat: b.location.lat,
    lng: b.location.lng,
    join_radius_m: b.joinRadiusM,
    timezone: b.timezone,
    hours: b.hours,
    holidays: b.closedDates,
    banks: {
      id: b.bank.id,
      slug: b.bank.slug,
      name: b.bank.name,
      short_name: b.bank.shortName,
    },
    counters: b.counters.map((c) => ({
      number: c.number,
      counter_groups: c.groupIds.map((gid) => ({ group_id: gid })),
    })),
  }));

  const banksRows = BANKS.map((bk) => ({
    id: bk.id,
    slug: bk.slug,
    name: bk.name,
    short_name: bk.shortName,
  }));

  const groupsRows = GROUPS.map((g) => ({
    id: g.id,
    name: g.name,
    token_prefix: g.tokenPrefix,
  }));

  const servicesRows = GROUPS.flatMap((g) =>
    g.services.map((s) => ({
      id: s.id,
      group_id: s.groupId,
      name: s.name,
      avg_service_min: s.avgServiceMin,
      bring: s.bring,
      bookable: s.bookable,
    }))
  );

  const waitingRows = branches.flatMap((b) =>
    GROUPS.flatMap((g) =>
      g.services.map((s) => ({
        branch_id: b.id,
        service_id: s.id,
        group_id: g.id,
        waiting: 3,
        open_counters: 2,
        total_counters: 2,
        avg_service_min: s.avgServiceMin,
      }))
    )
  );

  const client = {
    rpc: async (fn: string) => {
      if (fn === "server_now") return { data: now, error: null };
      return { data: null, error: new Error(`unknown rpc ${fn}`) };
    },
    from: (table: string) => {
      let filterBranchId: string | null = null;
      let _selectedFields: string | null = null;

      const builder = {
        select: (fields?: string) => {
          _selectedFields = fields ?? "*";
          return builder;
        },
        order: (_column: string) => builder,
        eq: (col: string, val: unknown) => {
          if (col === "branch_id") filterBranchId = String(val);
          return builder;
        },
        then: (resolve: (res: { data: unknown; error: unknown }) => void) => {
          let data: unknown = null;
          if (table === "branches") data = branchesRows;
          else if (table === "banks") data = banksRows;
          else if (table === "service_groups") data = groupsRows;
          else if (table === "services") data = servicesRows;
          else if (table === "service_waiting") {
            data = filterBranchId
              ? waitingRows.filter((r) => r.branch_id === filterBranchId)
              : waitingRows;
          } else {
            data = [];
          }
          resolve({ data, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;

  return client;
}

/**
 * Shared contract test suite running the identical assertions against both adapters.
 */
function testBranchServiceContract(name: string, factory: () => BranchService) {
  describe(`BranchService contract: ${name}`, () => {
    let service: BranchService;

    beforeEach(() => {
      service = factory();
    });

    it("list returns branches with all required properties", async () => {
      const branches = await service.list();
      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBeGreaterThan(0);

      const first = branches[0]!;
      expect(first).toBeDefined();
      expect(typeof first.id).toBe("string");
      expect(typeof first.name).toBe("string");
      expect(typeof first.slug).toBe("string");
      expect(typeof first.bankId).toBe("string");
      expect(first.bank).toBeDefined();
      expect(typeof first.bank.slug).toBe("string");
      expect(first.location).toBeDefined();
      expect(typeof first.location.lat).toBe("number");
      expect(typeof first.location.lng).toBe("number");
      expect(Array.isArray(first.hours)).toBe(true);
      expect(first.hours).toHaveLength(7);
      expect(Array.isArray(first.counters)).toBe(true);
      expect(first.counters.length).toBeGreaterThan(0);
    });

    it("finds a branch by valid bank slug and branch slug", async () => {
      const branch = await service.bySlug("sbi", "main-road");
      expect(branch).not.toBeNull();
      expect(branch?.name).toBe("Main Road Branch");
      expect(branch?.bank.slug).toBe("sbi");
      expect(branch?.slug).toBe("main-road");
    });

    it("returns null for non-existent branch or bank slug", async () => {
      expect(await service.bySlug("sbi", "non-existent-branch")).toBeNull();
      expect(await service.bySlug("unknown-bank", "main-road")).toBeNull();
    });

    it("finds a branch by ID", async () => {
      const branch = await service.byId("br_sbi_main_road");
      expect(branch).not.toBeNull();
      expect(branch?.id).toBe("br_sbi_main_road");
      expect(branch?.name).toBe("Main Road Branch");
    });

    it("returns null for non-existent branch ID", async () => {
      expect(await service.byId("invalid_branch_id")).toBeNull();
    });

    it("returns live catalogue with 4 groups and 12 services", async () => {
      const groups = await service.catalogue("br_sbi_main_road");
      expect(Array.isArray(groups)).toBe(true);
      expect(groups).toHaveLength(4);

      const allServices = groups.flatMap((g) => g.services);
      expect(allServices).toHaveLength(12);

      for (const s of allServices) {
        expect(typeof s.id).toBe("string");
        expect(typeof s.name).toBe("string");
        expect(typeof s.avgServiceMin).toBe("number");
        expect(typeof s.waiting).toBe("number");
        expect(s.waiting).toBeGreaterThanOrEqual(0);
        expect(s.usualWait).toBeDefined();
        expect(s.usualWait.minMin).toBeGreaterThanOrEqual(0);
        expect(s.usualWait.maxMin).toBeGreaterThanOrEqual(s.usualWait.minMin);
      }
    });

    it("throws branch_not_found DomainError when requesting catalogue for unknown branch", async () => {
      await expect(service.catalogue("br_unknown")).rejects.toThrow(DomainError);
    });

    it("produces a valid snapshot matching the live counts", async () => {
      const snap = await service.snapshot("br_sbi_main_road");
      expect(snap).toBeDefined();
      expect(snap.branchId).toBe("br_sbi_main_road");
      expect(typeof snap.waitingTotal).toBe("number");
      expect(snap.waitingTotal).toBeGreaterThanOrEqual(0);
      expect(typeof snap.usualWaitMin).toBe("number");
      expect(typeof snap.isOpen).toBe("boolean");
      expect(typeof snap.updatedAt).toBe("number");
    });

    it("throws branch_not_found DomainError when requesting snapshot for unknown branch", async () => {
      await expect(service.snapshot("br_unknown")).rejects.toThrow(DomainError);
    });

    it("fetches multiple snapshots in batch", async () => {
      const ids = ["br_sbi_main_road", "br_bob_navrangpura"];
      const snaps = await service.snapshots(ids);
      expect(snaps).toBeDefined();
      expect(Object.keys(snaps)).toEqual(expect.arrayContaining(ids));
      expect(snaps["br_sbi_main_road"]?.branchId).toBe("br_sbi_main_road");
      expect(snaps["br_bob_navrangpura"]?.branchId).toBe("br_bob_navrangpura");
    });

    it("snapshots throws branch_not_found if any ID is invalid", async () => {
      await expect(service.snapshots(["br_sbi_main_road", "br_nonexistent"])).rejects.toThrow(DomainError);
    });
  });
}

// 1. Run contract tests against the Mock adapter
testBranchServiceContract("Mock BranchService", () => {
  return createMockServices({ devtools: false }).branches;
});

// 2. Run contract tests against the Supabase adapter
testBranchServiceContract("Supabase BranchService", () => {
  const testClient = createTestSupabaseClient();
  return createSupabaseBranchService(testClient);
});
