import { onKeyChange, readJson, removeKey, writeJson } from "@/lib/storage";
import type { Booking, ID, Preferences, TokenRecord, User } from "@/domain";
import type { DevSettings } from "../types";

export const DB_KEY = "qbit9.mock.db.v1";
export const DEV_KEY = "qbit9.mock.dev.v1";

/** A token row in the mock carries its own pace so changing demo speed never makes places jump. */
export interface MockTokenRow extends TokenRecord {
  stepMs: number;
  /** Mock staff: time between "I am on my way" and being served. */
  arriveMs: number;
  /** Mock staff: time a visit takes at the counter. */
  serviceMs: number;
}

export interface OtpRow {
  code: string;
  expiresAt: number;
  resendAt: number;
  attempts: number;
}

export interface MockDb {
  users: Record<ID, User>;
  session: { userId: ID; expiresAt: number; remember: boolean } | null;
  otps: Record<string, OtpRow>;
  tokens: Record<ID, MockTokenRow>;
  bookings: Record<ID, Booking>;
  /** Last token number issued per `${branchId}|${groupId}|${dateKey}`. */
  numbers: Record<string, number>;
  prefs: Record<ID, Preferences>;
}

export const emptyDb = (): MockDb => ({ users: {}, session: null, otps: {}, tokens: {}, bookings: {}, numbers: {}, prefs: {} });

export function loadDb(): MockDb {
  return { ...emptyDb(), ...readJson<Partial<MockDb>>(DB_KEY, {}) };
}

export function saveDb(db: MockDb): void {
  writeJson(DB_KEY, db);
}

/** Read, change, write. The mock is synchronous underneath, so there are no races inside one tab. */
export function mutate<T>(fn: (db: MockDb) => T): T {
  const db = loadDb();
  try {
    return fn(db);
  } finally {
    // Saved even when `fn` throws so counters like OTP attempts persist. Services validate first
    // and only mutate once a request is known to be good.
    saveDb(db);
  }
}

export function resetDb(): void {
  removeKey(DB_KEY);
}

export const onDbChange = (fn: () => void) => onKeyChange(DB_KEY, fn);

export const DEFAULT_DEV: DevSettings = { speed: "demo", location: "real", forceClosed: false };

export const loadDev = (): DevSettings => ({ ...DEFAULT_DEV, ...readJson<Partial<DevSettings>>(DEV_KEY, {}) });
export const saveDev = (d: DevSettings) => writeJson(DEV_KEY, d);
export const onDevChange = (fn: () => void) => onKeyChange(DEV_KEY, fn);

export function uid(prefix: string): ID {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}
