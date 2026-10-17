import { describe, expect, it } from "vitest";
import {
  displayPhone, formatPhoneDigits, initialOf, maskEmail, maskPhone, normalizePhone, validateEmail, validateName, validateOtp, validatePhone,
} from "./validation";
import { formatTokenCode, ordinal, parseTokenCode } from "./tokens";

describe("phone", () => {
  it.each([
    ["98765 43210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("normalises %s", (input, out) => {
    expect(normalizePhone(input)).toBe(out);
    expect(validatePhone(input)).toEqual({ ok: true, value: out });
  });
  it.each(["12345", "5876543210", "98765432101", "abcdefghij", ""])("rejects %s", (input) => {
    expect(validatePhone(input).ok).toBe(false);
  });
  it("formats while typing", () => {
    expect(formatPhoneDigits("98765")).toBe("98765");
    expect(formatPhoneDigits("9876543")).toBe("98765 43");
    expect(formatPhoneDigits("98765432109999")).toBe("98765 43210");
  });
  it("masks and displays", () => {
    expect(maskPhone("9876543210")).toBe("+91 98••• ••210");
    expect(displayPhone("9876543210")).toBe("+91 98765 43210");
  });
});

describe("email, otp, name", () => {
  it("validates and lowercases email", () => {
    expect(validateEmail("  Suman@Example.COM ")).toEqual({ ok: true, value: "suman@example.com" });
    expect(validateEmail("nope").ok).toBe(false);
  });
  it("masks email", () => {
    expect(maskEmail("suman@example.com")).toBe("su•••@example.com");
  });
  it("accepts a four digit code only", () => {
    expect(validateOtp("4271").ok).toBe(true);
    expect(validateOtp("427").ok).toBe(false);
    expect(validateOtp("42711").ok).toBe(false);
    expect(validateOtp("42a1").ok).toBe(false);
  });
  it("treats name as optional", () => {
    expect(validateName("  ")).toEqual({ ok: true, value: null });
    expect(validateName(" Suman ")).toEqual({ ok: true, value: "Suman" });
    expect(validateName("Ananya Rao-Iyer").ok).toBe(true);
    expect(validateName("<script>").ok).toBe(false);
    expect(validateName("x".repeat(41)).ok).toBe(false);
  });
  it("takes the initial", () => {
    expect(initialOf("suman")).toBe("S");
    expect(initialOf(null)).toBe("Q");
  });
});

describe("token codes", () => {
  it("pads and parses", () => {
    expect(formatTokenCode("c", 7)).toBe("C-007");
    expect(formatTokenCode("P", 112)).toBe("P-112");
    expect(parseTokenCode("c-047")).toEqual({ prefix: "C", number: 47 });
    expect(parseTokenCode("nope")).toBeNull();
  });
  it("makes ordinals", () => {
    expect([1, 2, 3, 4, 8, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "8th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });
});
