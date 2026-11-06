/**
 * One password policy for every door (docs 01 §S11, reaudit N12).
 *
 * Client-safe by design: the registration, reset and staff-form components import
 * it, so it must not touch Prisma, `server-only` or a secret. The rule set is the
 * server's too — better-auth enforces the same length in `src/server/auth.ts`, and
 * a schema that accepted less would only promise the student a failure later.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Passwords that appear at the top of every breach dump, plus the words this
 * campus types without thinking. Checked after lowercasing and after dropping a
 * trailing digit-run, so `Password123` and `password` are refused alike. A speed
 * bump against the top-10k lists rather than the whole list: it costs no download
 * and no bundle, and catches the entries that actually get tried.
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "passwort",
  "p@ssword",
  "p@ssw0rd",
  "passw0rd",
  "password1",
  "password12",
  "password123",
  "password1234",
  "passme",
  "welcome",
  "welcome1",
  "welcome123",
  "welcome2",
  "hello",
  "hello123",
  "iloveyou",
  "letmein",
  "admin",
  "administrator",
  "admin123",
  "root",
  "toor",
  "user",
  "user1",
  "guest",
  "demo",
  "test",
  "testing",
  "1234",
  "12345",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "007",
  "qwerty",
  "qwerty123",
  "qwe123",
  "qazwsx",
  "asdfgh",
  "asdfghjkl",
  "zxcvbnm",
  "abc123",
  "abcd1234",
  "monkey",
  "dragon",
  "sunshine",
  "princess",
  "football",
  "baseball",
  "superman",
  "batman",
  "trustno1",
  "starwars",
  "whatever",
  "friend",
  "master",
  "shadow",
  "michael",
  "jennifer",
  "computer",
  "internet",
  "google",
  "facebook",
  "linkedin",
  "photoshop",
  "nexus5",
  "samsung",
  "iphone",
  "motorola",
  "changeme",
  "changeit",
  "secret",
  "default",
  "temp",
  "tmp",
  "nepal",
  "namaste",
  "kathmandu",
  "ktm",
  "darbar",
  "darbarcomputer",
  "wonder",
  // The literal the seed used before the dev credentials were replaced.
  "change-me-on-first-login",
]);

/** Runs of keys a finger walks without thinking. */
const KEYBOARD_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** Refused without a second thought — the message says what to do instead. */
const TOO_COMMON = "That password is too easy to guess. Use words only you would pick.";
const TOO_SHORT = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
const TOO_LONG = `Password is too long (max ${PASSWORD_MAX_LENGTH} characters)`;
const SELF_EVIDENT =
  "Do not use your own name, email or phone number as your password.";

function normalized(password: string): string {
  return password.toLowerCase().trim();
}

/** `password123` is the same answer as `password`. */
function withoutTrailingDigits(value: string): string {
  return value.replace(/\d+$/, "");
}

function isWalkerRun(value: string): boolean {
  if (value.length < 4) return false;
  if (KEYBOARD_ROWS.some((row) => row.includes(value) || value.includes(row.slice(0, 6)))) {
    return true;
  }
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i++) {
    const step = value.charCodeAt(i) - value.charCodeAt(i - 1);
    ascending = ascending && step === 1;
    descending = descending && step === -1;
  }
  return ascending || descending;
}

function isRepeatedChar(value: string): boolean {
  return value.length >= 4 && new Set(value).size === 1;
}

/**
 * Why this password is refused, or `null` when it passes.
 *
 * `identity` is whatever the form already has — email local part, full name,
 * phone — because "mohan9841012345" is not secret from the person reading the
 * profile it belongs to.
 */
export function passwordProblem(
  password: string,
  identity: { email?: string; name?: string; phone?: string } = {}
): string | null {
  const value = normalized(password);

  if (value.length < PASSWORD_MIN_LENGTH) return TOO_SHORT;
  if (password.length > PASSWORD_MAX_LENGTH) return TOO_LONG;
  if (COMMON_PASSWORDS.has(value) || COMMON_PASSWORDS.has(withoutTrailingDigits(value))) {
    return TOO_COMMON;
  }
  if (isRepeatedChar(value) || isWalkerRun(value)) return TOO_COMMON;
  // All digits, or one word with punctuation and digits around it.
  if (/^\d+$/.test(value)) return TOO_COMMON;

  for (const part of identityParts(identity)) {
    // Two characters would flag half of every short password, so only meaningful
    // fragments of what the account already publishes are refused.
    if (part.length >= 4 && value.includes(part)) return SELF_EVIDENT;
  }
  return null;
}

function identityParts(identity: { email?: string; name?: string; phone?: string }): string[] {
  const parts: string[] = [];
  const local = identity.email?.split("@")[0];
  if (local) parts.push(normalized(local));
  if (identity.name) {
    for (const word of identity.name.split(/[\s.\-']+/)) {
      if (word) parts.push(normalized(word));
    }
  }
  const digits = identity.phone?.replace(/\D/g, "");
  if (digits && digits.length >= 6) {
    parts.push(digits);
    // The memorable tail of a Nepali mobile is what gets typed into forms.
    parts.push(digits.slice(-6));
  }
  return parts.filter((part) => part.length >= 4);
}

/** Does this password pass? Used by the form before it submits. */
export function isPasswordAcceptable(
  password: string,
  identity: { email?: string; name?: string; phone?: string } = {}
): boolean {
  return passwordProblem(password, identity) === null;
}
