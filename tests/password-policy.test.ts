import { describe, expect, it } from "vitest";
import { isPasswordAcceptable, passwordProblem } from "@/lib/password-policy";
import { studentRegisterSchema } from "@/lib/validators/student";
import { newPasswordPairSchema } from "@/lib/validators/password-reset";
import { userCreateSchema } from "@/lib/validators/users";

/**
 * One password policy for three doors (docs 01 §S11, reaudit N12).
 *
 * Registration used to accept 8 characters while Better Auth's global
 * `minPasswordLength` is 10, so a student could sign up and then find every reset
 * refused by the library. Both halves are checked here: the length the form
 * promises, and the passwords a breach dump already contains.
 */

function fieldErrors(parsed: { error?: { flatten(): { fieldErrors: Record<string, string[]> } } }) {
  return parsed.error?.flatten().fieldErrors ?? {};
}

describe("passwordProblem", () => {
  it("refuses anything shorter than the ten characters Better Auth will accept", () => {
    expect(passwordProblem("Passw0rd!")).toBe("Password must be at least 10 characters");
    expect(passwordProblem("Passw0rd!9")).toBe(null);
  });

  it("refuses the passwords on every breach dump, with or without a digit tail", () => {
    for (const guess of [
      "password123",
      "password12345",
      "qwertyuiop",
      "1234567890",
      "aaaaaaaaaa",
      "123456789012345",
      "welcome2026",
      "change-me-on-first-login",
      "DARBARCOMPUTER",
    ]) {
      expect({ guess, problem: passwordProblem(guess) }).toEqual({
        guess,
        problem: "That password is too easy to guess. Use words only you would pick.",
      });
    }
    // Below the length line, length is the reason given — not "too common".
    expect(passwordProblem("password")).toBe("Password must be at least 10 characters");
  });

  it("refuses what the account itself publishes", () => {
    const identity = { email: "ram.sharma@example.com", name: "Ram Sharma", phone: "9841012345" };
    expect(passwordProblem("RamSharma2026", identity)).toBe(
      "Do not use your own name, email or phone number as your password."
    );
    expect(passwordProblem("ram.sharma1234", identity)).toBe(
      "Do not use your own name, email or phone number as your password."
    );
    // The memorable tail of the mobile is the guess a desk neighbour makes.
    expect(passwordProblem("cckathmandu012345", identity)).toBe(
      "Do not use your own name, email or phone number as your password."
    );
  });

  it("accepts a password a real person would actually choose", () => {
    expect(passwordProblem("Purple-Tiger-42", { email: "a@b.com", name: "Ann" })).toBe(null);
    expect(isPasswordAcceptable("stargazer, north 7")).toBe(true);
  });

  it("never echoes the password back in the reason", () => {
    const secret = "SuperSecretValue123";
    for (const problem of [
      passwordProblem("short"),
      passwordProblem("password"),
      passwordProblem(secret, { name: secret }),
    ]) {
      expect(problem).not.toContain(secret);
    }
  });
});

describe("student registration", () => {
  const base = {
    name: "Ram Sharma",
    email: "ram@example.com",
    phone: "9841012345",
    confirmPassword: "Nightjar-Sings-77",
    password: "Nightjar-Sings-77",
    turnstileToken: "token-value-long-enough",
    website: "",
  };

  it("no longer signs anybody up on eight characters", () => {
    const parsed = studentRegisterSchema.safeParse({ ...base, password: "Passwor1", confirmPassword: "Passwor1" });
    expect(parsed.success).toBe(false);
    expect(fieldErrors(parsed).password).toEqual(["Password must be at least 10 characters"]);
  });

  it("refuses a breach-list password on the password field", () => {
    const parsed = studentRegisterSchema.safeParse({
      ...base,
      password: "Password123",
      confirmPassword: "Password123",
    });
    expect(parsed.success).toBe(false);
    expect(fieldErrors(parsed).password?.[0]).toContain("too easy to guess");
  });

  it("keeps the confirmation error on its own field", () => {
    const parsed = studentRegisterSchema.safeParse({ ...base, confirmPassword: "Nightjar-Sings-78" });
    expect(parsed.success).toBe(false);
    expect(fieldErrors(parsed).confirmPassword).toEqual(["Passwords do not match"]);
  });

  it("accepts a fresh ten-plus character choice", () => {
    expect(studentRegisterSchema.safeParse(base).success).toBe(true);
  });
});

describe("password reset", () => {
  it("refuses a reset to a password that is already public", () => {
    const parsed = newPasswordPairSchema.safeParse({
      newPassword: "Welcome1234",
      confirmPassword: "Welcome1234",
    });
    expect(parsed.success).toBe(false);
    expect(fieldErrors(parsed).newPassword?.[0]).toContain("too easy to guess");
  });

  it("accepts a new one that only has to be long and unusual", () => {
    const parsed = newPasswordPairSchema.safeParse({
      newPassword: "Kettle-Humming-31",
      confirmPassword: "Kettle-Humming-31",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("staff accounts", () => {
  it("refuses a desk password someone could guess from the name card", () => {
    const parsed = userCreateSchema.safeParse({
      name: "Sita Lama",
      email: "sita.lama@darbar.test",
      role: "ACCOUNTANT",
      password: "sitalama2026!",
      isActive: true,
    });
    expect(parsed.success).toBe(false);
    expect(fieldErrors(parsed).password?.[0]).toContain("own name");
  });
});
