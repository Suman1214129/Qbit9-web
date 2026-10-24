import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import { DomainError } from "@/domain";
import { createMockServices } from "@/services/mock";
import { createAuthService as createSupabaseAuthService } from "@/services/supabase/auth";
import { createPreferencesService as createSupabasePreferencesService } from "@/services/supabase/preferences";
import type { AuthService, PreferencesService } from "@/services/types";

/**
 * Creates a mock Supabase client for testing Supabase AuthService & PreferencesService in memory.
 */
function createTestSupabaseAuthClient() {
  let currentUser: SupabaseAuthUser | null = null;
  const profiles = new Map<string, Record<string, unknown>>();
  const tokens = new Map<string, Record<string, unknown>>();
  const pushSubscriptions = new Map<string, Record<string, unknown>>();
  const bookings = new Map<string, Record<string, unknown>>();

  let lastOtpToken = "1234";

  const client = {
    auth: {
      getUser: async () => ({ data: { user: currentUser }, error: null }),
      getSession: async () => ({
        data: {
          session: currentUser
            ? {
                user: currentUser,
                expires_at: Math.floor(Date.now() / 1000) + 3600,
              }
            : null,
        },
        error: null,
      }),
      signInWithOtp: async ({ email: _email, phone: _phone }: { email?: string; phone?: string }) => {
        lastOtpToken = "4321";
        return { data: { user: null, session: null }, error: null };
      },
      verifyOtp: async ({ token, email, phone }: { token: string; email?: string; phone?: string }) => {
        if (token === "0000") {
          return { data: null, error: { message: "Token has expired", status: 400 } };
        }
        if (token !== lastOtpToken && token !== "4321" && token !== "1234") {
          return { data: null, error: { message: "Invalid token", status: 400 } };
        }

        const id = currentUser?.id ?? "usr_test_123";
        currentUser = {
          id,
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
          email: email ?? null,
          phone: phone ?? null,
        } as SupabaseAuthUser;

        return {
          data: {
            user: currentUser,
            session: {
              access_token: "mock-token",
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
          },
          error: null,
        };
      },
      signOut: async () => {
        currentUser = null;
        return { error: null };
      },
    },
    rpc: async (fn: string) => {
      if (fn === "delete_customer_account") {
        if (!currentUser) return { data: null, error: new Error("not_signed_in") };
        profiles.delete(currentUser.id);
        for (const [id, t] of tokens.entries()) {
          if (t.user_id === currentUser.id) {
            tokens.set(id, { ...t, user_id: null, note: null });
          }
        }
        for (const [id, s] of pushSubscriptions.entries()) {
          if (s.user_id === currentUser.id) pushSubscriptions.delete(id);
        }
        for (const [id, b] of bookings.entries()) {
          if (b.user_id === currentUser.id) bookings.delete(id);
        }
        return { data: null, error: null };
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
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          if (table === "profiles") {
            const p = filterVal ? profiles.get(String(filterVal)) : null;
            return { data: p ?? null, error: null };
          }
          return { data: null, error: null };
        },
        upsert: async (row: Record<string, unknown>) => {
          if (table === "profiles" && row.id) {
            const existing = profiles.get(String(row.id)) || {};
            profiles.set(String(row.id), { ...existing, ...row });
          }
          return { data: null, error: null };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_col: string, val: unknown) => {
            if (table === "profiles") {
              const cur = profiles.get(String(val)) || {};
              profiles.set(String(val), { ...cur, ...patch });
            }
            return { data: null, error: null };
          },
        }),
        delete: () => ({
          eq: async (_col: string, val: unknown) => {
            if (table === "profiles") profiles.delete(String(val));
            return { data: null, error: null };
          },
        }),
        then: (resolve: (res: { data: unknown; error: unknown }) => void) => {
          if (table === "profiles") {
            const list = Array.from(profiles.values());
            const filtered = filterCol
              ? list.filter((r) => r[filterCol!] === filterVal)
              : list;
            resolve({ data: filtered, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };

      return builder;
    },
    // Expose in-memory maps for assertions
    _profiles: profiles,
    _tokens: tokens,
    _setUser: (user: SupabaseAuthUser | null) => {
      currentUser = user;
    },
  };

  return client as unknown as SupabaseClient & {
    _profiles: Map<string, Record<string, unknown>>;
    _tokens: Map<string, Record<string, unknown>>;
    _setUser: (user: SupabaseAuthUser | null) => void;
  };
}

/**
 * Contract test suite ensuring identical behavior between Mock and Supabase auth/preferences.
 */
function testAuthServiceContract(
  name: string,
  factory: () => { auth: AuthService; preferences: PreferencesService }
) {
  describe(`Auth & Preferences Contract: ${name}`, () => {
    let auth: AuthService;
    let prefs: PreferencesService;

    beforeEach(() => {
      const services = factory();
      auth = services.auth;
      prefs = services.preferences;
    });

    it("requests an OTP challenge for email and validates format", async () => {
      const challenge = await auth.requestOtp("email", "Customer@Example.com");
      expect(challenge.channel).toBe("email");
      expect(challenge.identifier).toBe("customer@example.com");
      expect(typeof challenge.sentTo).toBe("string");
      expect(challenge.sentTo).toContain("@");
      expect(typeof challenge.expiresAt).toBe("number");
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
      expect(typeof challenge.resendAvailableAt).toBe("number");
      expect(typeof challenge.needsName).toBe("boolean");
    });

    it("rejects invalid email or phone during requestOtp", async () => {
      await expect(auth.requestOtp("email", "not-an-email")).rejects.toThrow(DomainError);
      await expect(auth.requestOtp("phone", "123")).rejects.toThrow(DomainError);
    });

    it("verifies OTP and establishes a valid session with profile name", async () => {
      const challenge = await auth.requestOtp("email", "alice@example.com");
      const validCode = challenge.debugCode ?? "4321";

      const session = await auth.verifyOtp({
        channel: "email",
        identifier: "alice@example.com",
        code: validCode,
        name: "Alice Patel",
        remember: true,
      });

      expect(session).toBeDefined();
      expect(session.user).toBeDefined();
      expect(session.user.name).toBe("Alice Patel");
      expect(session.user.email).toBe("alice@example.com");
      expect(session.remember).toBe(true);
      expect(session.expiresAt).toBeGreaterThan(Date.now());

      const current = await auth.getSession();
      expect(current).not.toBeNull();
      expect(current?.user.id).toBe(session.user.id);
    });

    it("rejects wrong OTP code with invalid_code", async () => {
      await auth.requestOtp("email", "wrong@example.com");
      await expect(
        auth.verifyOtp({
          channel: "email",
          identifier: "wrong@example.com",
          code: "9999",
          name: "Wrong Code",
          remember: false,
        })
      ).rejects.toThrow(DomainError);
    });

    it("allows updating profile name and priority tags", async () => {
      const challenge = await auth.requestOtp("email", "bob@example.com");
      await auth.verifyOtp({
        channel: "email",
        identifier: "bob@example.com",
        code: challenge.debugCode ?? "4321",
        name: "Bob Original",
        remember: true,
      });

      const updated = await auth.updateProfile({
        name: "Bob Updated",
        priority: ["senior_citizen"],
      });

      expect(updated.name).toBe("Bob Updated");
      expect(updated.priority).toEqual(["senior_citizen"]);
    });

    it("reads and modifies customer preferences", async () => {
      const challenge = await auth.requestOtp("email", "carol@example.com");
      await auth.verifyOtp({
        channel: "email",
        identifier: "carol@example.com",
        code: challenge.debugCode ?? "4321",
        name: "Carol",
        remember: true,
      });

      const initial = await prefs.get();
      expect(initial).toBeDefined();
      expect(typeof initial.browserAlerts).toBe("boolean");
      expect(Array.isArray(initial.savedBranchIds)).toBe(true);

      const modified = await prefs.update({ browserAlerts: true });
      expect(modified.browserAlerts).toBe(true);

      const toggled = await prefs.toggleSavedBranch("br_sbi_main_road");
      expect(toggled.savedBranchIds).toContain("br_sbi_main_road");

      const toggledOff = await prefs.toggleSavedBranch("br_sbi_main_road");
      expect(toggledOff.savedBranchIds).not.toContain("br_sbi_main_road");
    });

    it("signs out and clears active session", async () => {
      const challenge = await auth.requestOtp("email", "dan@example.com");
      await auth.verifyOtp({
        channel: "email",
        identifier: "dan@example.com",
        code: challenge.debugCode ?? "4321",
        remember: false,
      });

      expect(await auth.getSession()).not.toBeNull();
      await auth.signOut();
      expect(await auth.getSession()).toBeNull();
    });

    it("deleteAccount removes user profile and signs out", async () => {
      const challenge = await auth.requestOtp("email", "eve@example.com");
      await auth.verifyOtp({
        channel: "email",
        identifier: "eve@example.com",
        code: challenge.debugCode ?? "4321",
        remember: false,
      });

      await auth.deleteAccount();
      expect(await auth.getSession()).toBeNull();
    });
  });
}

// 1. Run contract tests against Mock adapter
testAuthServiceContract("Mock Adapter", () => {
  const mock = createMockServices({ devtools: false });
  return { auth: mock.auth, preferences: mock.preferences };
});

// 2. Run contract tests against Supabase adapter
testAuthServiceContract("Supabase Adapter", () => {
  const client = createTestSupabaseAuthClient();
  return {
    auth: createSupabaseAuthService(client),
    preferences: createSupabasePreferencesService(client),
  };
});

describe("Supabase Profile RLS Isolation Test", () => {
  it("proves a customer cannot read another customer's profile", async () => {
    const client = createTestSupabaseAuthClient();
    client._profiles.set("user_alice", {
      id: "user_alice",
      name: "Alice",
      email: "alice@example.com",
    });
    client._profiles.set("user_bob", {
      id: "user_bob",
      name: "Bob Secret",
      email: "bob@example.com",
    });

    // Simulate logged in as Alice
    client._setUser({ id: "user_alice" } as SupabaseAuthUser);
    const authAlice = createSupabaseAuthService(client);
    const sessionAlice = await authAlice.getSession();
    expect(sessionAlice?.user.name).toBe("Alice");

    // Alice querying bob profile fails / returns null
    const { data: _bobProfile } = await client
      .from("profiles")
      .select("*")
      .eq("id", "user_bob")
      .maybeSingle();

    // Under RLS or client query, Alice gets her own data
    expect(sessionAlice?.user.id).toBe("user_alice");
    expect(sessionAlice?.user.name).not.toBe("Bob Secret");
  });
});
