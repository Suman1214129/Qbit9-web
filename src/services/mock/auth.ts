import {
  DomainError, displayPhone, maskEmail, validateEmail, validateName, validateOtp, validatePhone, validatePrioritySafe,
  type OtpChannel, type Preferences, type Session, type User,
} from "@/domain";
import { clock } from "@/lib/clock";
import { env } from "@/lib/env";
import type { AuthService, OtpChallenge, ProfilePatch, VerifyInput } from "../types";
import { loadDb, mutate, resetDb, uid, type MockDb } from "./db";
import { seedHistory } from "./seed-history";

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

const otpKey = (channel: OtpChannel, id: string) => `${channel}:${id}`;
const findUser = (db: MockDb, channel: OtpChannel, id: string): User | undefined =>
  Object.values(db.users).find((u) => (channel === "phone" ? u.phone === id : u.email === id));

export function currentUser(db: MockDb, now = clock.now()): User {
  const s = db.session;
  const user = s ? db.users[s.userId] : undefined;
  if (!s || !user || s.expiresAt <= now) throw new DomainError("not_signed_in");
  return user;
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

export function createAuthService(): AuthService {
  return {
    async getSession() {
      const now = clock.now();
      const db = loadDb();
      const s = db.session;
      const user = s ? db.users[s.userId] : undefined;
      if (!s || !user || s.expiresAt <= now) return null;
      return { user, expiresAt: s.expiresAt, remember: s.remember } satisfies Session;
    },

    async requestOtp(channel, identifierRaw): Promise<OtpChallenge> {
      const identifier = normalise(channel, identifierRaw);
      const now = clock.now();
      return mutate((db) => {
        const key = otpKey(channel, identifier);
        const existing = db.otps[key];
        // Re-sending inside the cooldown just returns the same code, like a real provider would throttle.
        let row = existing;
        if (!row || row.resendAt <= now || row.expiresAt <= now) {
          row = { code: String(Math.floor(1000 + Math.random() * 9000)), expiresAt: now + OTP_TTL_MS, resendAt: now + RESEND_MS, attempts: 0 };
          db.otps[key] = row;
        }
        const user = findUser(db, channel, identifier);
        return {
          channel,
          identifier,
          sentTo: channel === "phone" ? displayPhone(identifier) : maskEmail(identifier),
          expiresAt: row.expiresAt,
          resendAvailableAt: row.resendAt,
          needsName: !user?.name,
          debugCode: row.code,
        };
      });
    },

    async verifyOtp(input: VerifyInput) {
      const identifier = normalise(input.channel, input.identifier);
      const code = validateOtp(input.code);
      if (!code.ok) throw new DomainError("invalid_code", code.error);
      const name = validateName(input.name ?? "");
      if (!name.ok) throw new DomainError("unknown", name.error);
      const now = clock.now();

      return mutate((db) => {
        const key = otpKey(input.channel, identifier);
        const row = db.otps[key];
        if (!row) throw new DomainError("code_expired");
        if (row.expiresAt <= now) {
          delete db.otps[key];
          throw new DomainError("code_expired");
        }
        if (row.attempts >= MAX_ATTEMPTS) throw new DomainError("too_many_attempts");
        if (row.code !== code.value) {
          row.attempts += 1;
          throw new DomainError("invalid_code");
        }
        delete db.otps[key];

        let user = findUser(db, input.channel, identifier);
        let isNew = false;
        if (!user) {
          isNew = true;
          user = {
            id: uid("usr"),
            name: name.value,
            phone: input.channel === "phone" ? identifier : null,
            email: input.channel === "email" ? identifier : null,
            priority: [],
            createdAt: now,
          };
          db.users[user.id] = user;
          db.prefs[user.id] = defaultPrefs(input.channel);
        } else if (!user.name && name.value) {
          user = { ...user, name: name.value };
          db.users[user.id] = user;
        }
        const expiresAt = now + (input.remember ? 30 * DAY : 12 * 3_600_000);
        db.session = { userId: user.id, expiresAt, remember: input.remember };
        if (isNew && env.mockSeedHistory) seedHistory(db, user, now);
        return { user, expiresAt, remember: input.remember } satisfies Session;
      });
    },

    async updateProfile(patch: ProfilePatch) {
      return mutate((db) => {
        const user = currentUser(db);
        const next: User = { ...user };
        if (patch.name !== undefined) {
          const r = validateName(patch.name ?? "");
          if (!r.ok) throw new DomainError("unknown", r.error);
          next.name = r.value;
        }
        if (patch.priority !== undefined) next.priority = validatePrioritySafe(patch.priority);
        db.users[user.id] = next;
        return next;
      });
    },

    async signOut() {
      mutate((db) => {
        db.session = null;
      });
    },

    async deleteAccount() {
      mutate((db) => {
        const user = currentUser(db);
        delete db.users[user.id];
        delete db.prefs[user.id];
        for (const [id, t] of Object.entries(db.tokens)) if (t.userId === user.id) delete db.tokens[id];
        for (const [id, b] of Object.entries(db.bookings)) if (b.userId === user.id) delete db.bookings[id];
        db.session = null;
      });
      if (Object.keys(loadDb().users).length === 0) resetDb();
    },
  };
}
