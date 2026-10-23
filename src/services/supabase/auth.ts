import type { SupabaseClient, User as SupabaseAuthUser } from "@supabase/supabase-js";
import {
  DomainError,
  displayPhone,
  maskEmail,
  validateEmail,
  validateName,
  validateOtp,
  validatePhone,
  validatePrioritySafe,
  type OtpChannel,
  type Preferences,
  type Session,
  type User,
} from "@/domain";
import { clock } from "@/lib/clock";
import { env } from "@/lib/env";
import type { AuthService, OtpChallenge, ProfilePatch, VerifyInput } from "../types";
import { getSupabaseClient } from "./client";

const OTP_TTL_MS = 10 * 60_000;
const RESEND_MS = 30_000;
const MAX_ATTEMPTS = 5;
const DAY = 86_400_000;

function normalise(channel: OtpChannel, identifier: string): string {
  if (channel === "phone") {
    const r = validatePhone(identifier);
    if (!r.ok) throw new DomainError("invalid_phone", r.error);
    return r.value;
  }
  const r = validateEmail(identifier);
  if (!r.ok) throw new DomainError("invalid_email", r.error);
  return r.value;
}

export function defaultPrefs(channel: OtpChannel): Preferences {
  return {
    browserAlerts: false,
    emailAlerts: channel === "email",
    smsAlerts: env.featureSms && channel === "phone",
    whatsappAlerts: false,
    savedBranchIds: [],
    lastBranchId: null,
  };
}

interface RateLimitEntry {
  expiresAt: number;
  resendAt: number;
  attempts: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

function getRateKey(channel: OtpChannel, identifier: string): string {
  return `${channel}:${identifier}`;
}

export function createAuthService(client?: SupabaseClient): AuthService {
  const sb = client ?? getSupabaseClient();

  const getProfile = async (userId: string): Promise<Record<string, unknown> | null> => {
    const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error && error.code !== "PGRST116") return null;
    return (data as Record<string, unknown>) ?? null;
  };

  const getAuthUser = async (): Promise<SupabaseAuthUser | null> => {
    const { data } = await sb.auth.getUser();
    return data?.user ?? null;
  };

  return {
    async getSession(): Promise<Session | null> {
      const user = await getAuthUser();
      if (!user) return null;

      const profile = await getProfile(user.id);
      if (!profile) return null;

      const createdAt = profile.created_at ? new Date(String(profile.created_at)).getTime() : clock.now();
      const priorityTags = Array.isArray(profile.priority_tags)
        ? validatePrioritySafe(profile.priority_tags as string[])
        : [];

      const domainUser: User = {
        id: user.id,
        name: (profile.name as string) ?? null,
        phone: (profile.phone as string) ?? user.phone ?? null,
        email: (profile.email as string) ?? user.email ?? null,
        priority: priorityTags,
        createdAt,
      };

      const { data: sessionData } = await sb.auth.getSession();
      const expiresAt = sessionData?.session?.expires_at
        ? sessionData.session.expires_at * 1000
        : clock.now() + 12 * 3_600_000;

      return {
        user: domainUser,
        expiresAt,
        remember: true,
      };
    },

    async requestOtp(channel: OtpChannel, identifierRaw: string): Promise<OtpChallenge> {
      const identifier = normalise(channel, identifierRaw);
      const now = clock.now();
      const key = getRateKey(channel, identifier);
      const existing = rateLimits.get(key);

      let row = existing;
      if (!row || row.resendAt <= now || row.expiresAt <= now) {
        row = { expiresAt: now + OTP_TTL_MS, resendAt: now + RESEND_MS, attempts: 0 };
        rateLimits.set(key, row);
      }

      if (channel === "email") {
        const { error } = await sb.auth.signInWithOtp({
          email: identifier,
          options: { shouldCreateUser: true },
        });
        if (error) {
          if (error.status === 429 || error.message.toLowerCase().includes("rate limit")) {
            throw new DomainError("too_many_attempts");
          }
        }
      } else if (channel === "phone" && env.featureSms) {
        const { error } = await sb.auth.signInWithOtp({
          phone: identifier,
          options: { shouldCreateUser: true },
        });
        if (error) {
          if (error.status === 429 || error.message.toLowerCase().includes("rate limit")) {
            throw new DomainError("too_many_attempts");
          }
        }
      }

      // Check if user profile already has a name
      const { data: existingProfiles } = await sb
        .from("profiles")
        .select("name")
        .eq(channel === "phone" ? "phone" : "email", identifier)
        .limit(1);

      const hasName = Boolean(existingProfiles && existingProfiles[0] && existingProfiles[0].name);

      return {
        channel,
        identifier,
        sentTo: channel === "phone" ? displayPhone(identifier) : maskEmail(identifier),
        expiresAt: row.expiresAt,
        resendAvailableAt: row.resendAt,
        needsName: !hasName,
        // In real mode, debugCode is never returned
        debugCode: undefined,
      };
    },

    async verifyOtp(input: VerifyInput): Promise<Session> {
      const identifier = normalise(input.channel, input.identifier);
      const code = validateOtp(input.code);
      if (!code.ok) throw new DomainError("invalid_code", code.error);

      const name = validateName(input.name ?? "");
      if (!name.ok) throw new DomainError("unknown", name.error);

      const now = clock.now();
      const key = getRateKey(input.channel, identifier);
      const row = rateLimits.get(key);

      if (row) {
        if (row.expiresAt <= now) {
          rateLimits.delete(key);
          throw new DomainError("code_expired");
        }
        if (row.attempts >= MAX_ATTEMPTS) {
          throw new DomainError("too_many_attempts");
        }
      }

      const { data, error } =
        input.channel === "email"
          ? await sb.auth.verifyOtp({
              email: identifier,
              token: input.code,
              type: "email",
            })
          : await sb.auth.verifyOtp({
              phone: identifier,
              token: input.code,
              type: "sms",
            });

      if (error || !data?.user) {
        if (row) row.attempts += 1;
        const msg = (error?.message || "").toLowerCase();
        if (msg.includes("expired")) throw new DomainError("code_expired");
        if (msg.includes("too many") || error?.status === 429) throw new DomainError("too_many_attempts");
        throw new DomainError("invalid_code");
      }

      rateLimits.delete(key);

      const authUser = data.user;
      let profile = await getProfile(authUser.id);

      if (!profile) {
        const newProfile = {
          id: authUser.id,
          name: name.value,
          phone: input.channel === "phone" ? identifier : null,
          email: input.channel === "email" ? identifier : null,
          alerts: defaultPrefs(input.channel),
          priority_tags: [],
          consent_at: new Date().toISOString(),
        };
        await sb.from("profiles").upsert(newProfile);
        profile = newProfile;
      } else if (!profile.name && name.value) {
        await sb.from("profiles").update({ name: name.value }).eq("id", authUser.id);
        profile = { ...profile, name: name.value };
      }

      const expiresAt = now + (input.remember ? 30 * DAY : 12 * 3_600_000);
      const priorityTags = Array.isArray(profile.priority_tags)
        ? validatePrioritySafe(profile.priority_tags as string[])
        : [];

      return {
        user: {
          id: authUser.id,
          name: (profile.name as string) ?? null,
          phone: (profile.phone as string) ?? authUser.phone ?? null,
          email: (profile.email as string) ?? authUser.email ?? null,
          priority: priorityTags,
          createdAt: profile.created_at ? new Date(String(profile.created_at)).getTime() : now,
        },
        expiresAt,
        remember: input.remember,
      };
    },

    async updateProfile(patch: ProfilePatch): Promise<User> {
      const user = await getAuthUser();
      if (!user) throw new DomainError("not_signed_in");

      const updates: Record<string, unknown> = {};
      if (patch.name !== undefined) {
        const r = validateName(patch.name ?? "");
        if (!r.ok) throw new DomainError("unknown", r.error);
        updates.name = r.value;
      }
      if (patch.priority !== undefined) {
        updates.priority_tags = validatePrioritySafe(patch.priority);
      }

      if (Object.keys(updates).length > 0) {
        await sb.from("profiles").update(updates).eq("id", user.id);
      }

      const profile = await getProfile(user.id);
      const priorityTags = Array.isArray(profile?.priority_tags)
        ? validatePrioritySafe(profile?.priority_tags as string[])
        : [];

      return {
        id: user.id,
        name: (profile?.name as string) ?? null,
        phone: (profile?.phone as string) ?? user.phone ?? null,
        email: (profile?.email as string) ?? user.email ?? null,
        priority: priorityTags,
        createdAt: profile?.created_at ? new Date(String(profile.created_at)).getTime() : clock.now(),
      };
    },

    async signOut(): Promise<void> {
      await sb.auth.signOut();
    },

    async deleteAccount(): Promise<void> {
      const user = await getAuthUser();
      if (!user) throw new DomainError("not_signed_in");

      // Attempt atomic database procedure
      const { error } = await sb.rpc("delete_customer_account");
      if (error) {
        // Fallback: direct table operations
        await sb.from("tokens").update({ user_id: null, note: null }).eq("user_id", user.id);
        await sb.from("push_subscriptions").delete().eq("user_id", user.id);
        await sb.from("bookings").delete().eq("user_id", user.id);
        await sb.from("profiles").delete().eq("id", user.id);
      }

      await sb.auth.signOut();
    },
  };
}

export const createSupabaseAuthService = createAuthService;
