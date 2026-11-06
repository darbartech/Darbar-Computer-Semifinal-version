/**
 * Public certificate references (docs 01 §S7).
 *
 * A verification token is 24 random bytes, so a QR link is unguessable and needs no
 * second factor. A printed certificate number is only sequential with a short random
 * suffix, so a manual search has to prove the asker knows who the certificate belongs
 * to. Both shapes are decided here, in one client-safe module, so the form, the action
 * and the data layer cannot disagree about what the visitor typed.
 */

/** `generateVerificationToken()` emits 32 base64url characters; accept 16–128 for safety. */
export const VERIFICATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * The printed reference: `DT-CERT-<year>-<sequence>`, with the optional 4-character
 * suffix added by docs 01 §S7; the older suffix-less numbers stay valid.
 *
 * The prefix is spelled out here instead of imported from `issuance.ts` because the
 * browser needs this rule too and issuance is server-only. `tests/sequences.test.ts`
 * checks every minted number against it, so the two cannot drift apart silently.
 */
export const CERTIFICATE_NUMBER_PATTERN =
  /^DT-CERT-\d{4}-\d{3,6}(-[A-HJKM-NP-TV-Z2-9]{1,8})?$/;

/**
 * One answer for every kind of miss (docs 01 §S7). Naming the failing half would turn
 * the search box into an oracle for "does this number exist?".
 */
export const CERTIFICATE_NOT_FOUND_MESSAGE =
  "We could not find a certificate matching those details. Check the certificate number and the name exactly as printed, then try again.";

/**
 * A printed number is also 16–128 URL-safe characters, so shape alone cannot tell the
 * two references apart and the prefix decides. Getting this order wrong would let a
 * certificate number slip through the token branch and skip the name requirement.
 */
export function tokenFromReference(value: string): string | null {
  const compact = value.trim().replace(/\s+/g, "");
  if (!compact) return null;

  const urlMatch = compact.match(/verify\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/);
  if (urlMatch) return urlMatch[1];
  if (isCertificateNumber(compact)) return null;

  return VERIFICATION_TOKEN_PATTERN.test(compact) ? compact : null;
}

/** Strips the spacing a hand-typed number picks up and folds it to stored case. */
export function normalizeCertificateNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Accepts lower case and the spaces people type between the dashes. */
export function isCertificateNumber(value: string): boolean {
  return CERTIFICATE_NUMBER_PATTERN.test(normalizeCertificateNumber(value));
}

/**
 * Names are compared exactly, but only after the things a second typist cannot
 * reproduce are removed: case, spacing, and the punctuation or accents a printed
 * card may or may not carry. "Ram Bahadur Thapa", "ram  bahadur-thapa." and
 * "Ram Bahadur Thapa" therefore agree, while "Ram Sharma" still refuses a
 * certificate belonging to someone else — the comparison stays whole-name, so
 * tolerance here never becomes a partial-match leak.
 *
 * Devanagari is deliberately untouched: its vowel signs sit outside the combining
 * range below, so "राम" keeps its matras.
 */
export function normalizePersonName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[\-–—_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function maskToken(token: string): string {
  const chars = Array.from(token);
  if (chars.length <= 1) return "*";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}

/**
 * "Ram Sharma" → "Ram S****a". The name that unlocks a text lookup stays partly
 * hidden on the result, so a shared screenshot of a verified page cannot hand the
 * full name to whoever sees it. QR arrivals are not masked: whoever scanned the
 * certificate already held it.
 */
export function maskRecipientName(value: string): string {
  const tokens = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (tokens.length === 0) return "";
  const masked = maskToken(tokens[tokens.length - 1]);
  return [...tokens.slice(0, -1), masked].join(" ");
}
