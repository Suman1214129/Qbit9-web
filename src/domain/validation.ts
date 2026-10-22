import { z } from "zod";
import { PRIORITY_TAGS } from "./types";

/** Strip spaces, dashes, a +91 or 0 prefix. Returns digits only. */
export function normalizePhone(input: string): string {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+91")) d = d.slice(3);
  else if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d.replace(/\D/g, "");
}

export const phoneSchema = z
  .string()
  .transform(normalizePhone)
  .refine((v) => /^[6-9]\d{9}$/.test(v), { message: "Enter a 10 digit mobile number" });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address" }));

export const OTP_LENGTH = 4;
export const otpSchema = z.string().regex(new RegExp(`^\\d{${OTP_LENGTH}}$`), { message: `Enter the ${OTP_LENGTH} digit code` });

export const nameSchema = z
  .string()
  .trim()
  .max(40, { message: "Keep it under 40 characters" })
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, { message: "Use letters only" });

/** Drops anything that is not a known tag and removes duplicates. */
export function validatePrioritySafe(input: readonly string[]): (typeof PRIORITY_TAGS)[number][] {
  const out: (typeof PRIORITY_TAGS)[number][] = [];
  for (const t of PRIORITY_TAGS) if (input.includes(t)) out.push(t);
  return out;
}

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

function run<T>(schema: z.ZodType<T>, input: unknown): FieldResult<T> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues[0]?.message ?? "Invalid" };
}

export const validatePhone = (v: string) => run(phoneSchema, v);
export const validateEmail = (v: string) => run(emailSchema, v);
export const validateOtp = (v: string) => run(otpSchema, v);
/** Name is optional: an empty string is valid and becomes null. */
export function validateName(v: string): FieldResult<string | null> {
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  return run(nameSchema, t);
}

/** "98765 43210" while typing. Input is raw digits (<= 10). */
export function formatPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

/** "+91 98••• ••210" for review screens. */
export function maskPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length !== 10) return digits;
  return `+91 ${d.slice(0, 2)}••• ••${d.slice(7)}`;
}

export function displayPhone(digits: string): string {
  const d = normalizePhone(digits);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : digits;
}

export function maskEmail(email: string): string {
  const [user = "", host = ""] = email.split("@");
  if (!host) return email;
  const head = user.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, user.length - 2))}@${host}`;
}

export function initialOf(name: string | null | undefined, fallback = "Q"): string {
  const c = name?.trim().charAt(0);
  return c ? c.toUpperCase() : fallback;
}
