/**
 * Shared server/auth constants.
 *
 * Deliberately NOT marked `import "server-only"`: `src/proxy.ts` needs the
 * session cookie name to build its redirect, and proxy.ts runs before any
 * server module boundary. This module holds no secrets and no server
 * dependencies (Prisma, crypto, email) — only literal values — so there is
 * nothing here to leak into a client bundle.
 */

/** `advanced.cookiePrefix` in src/server/auth.ts. */
export const AUTH_COOKIE_PREFIX = "darbar_auth";

/**
 * Better Auth writes the session cookie as `${cookiePrefix}.${cookieName}`,
 * i.e. `darbar_auth.session_token` (not `darbar_auth_session_token`).
 */
export const SESSION_COOKIE_NAME = `${AUTH_COOKIE_PREFIX}.session_token`;

/**
 * With `advanced.useSecureCookies` (production) Better Auth adds the
 * `__Secure-` prefix, so proxy.ts must look for both names.
 */
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

/** 7 days sliding expiry (docs/08 §1). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Staff URLs a signed-out person may open: login plus the reset flow (docs 01 §S4). */
export const ADMIN_LOGIN_PATH = "/techdarbar/login";
export const ADMIN_PASSWORD_FORGOT_PATH = "/techdarbar/forgot-password";
export const ADMIN_PASSWORD_RESET_PATH = "/techdarbar/reset-password";

/** Student-portal equivalents, outside the `(portal)` guard. */
export const STUDENT_PASSWORD_FORGOT_PATH = "/student/forgot-password";
export const STUDENT_PASSWORD_RESET_PATH = "/student/reset-password";

/**
 * The page a signed-in student sees until they confirm their email
 * (docs 01 §S3). It reads the session directly instead of going through
 * `requireStudent()`, so the gate cannot bounce it to itself.
 */
export const STUDENT_VERIFY_EMAIL_PATH = "/student/verify-email";

/** Student-portal login. Used by src/proxy.ts and the portal layout guard. */
export const STUDENT_LOGIN_PATH = "/student/login";

/** URL prefix for every student-portal page (the guard redirects anything else). */
export const STUDENT_PORTAL_PREFIX = "/student";

/** Public portfolio base path. */
export const PORTFOLIO_PATH = "/portfolio";

/** Cloudinary folder all staff uploads are forced into (docs/08 §1 folder allow-list). */
export const MEDIA_UPLOAD_FOLDER = "darbar/admin";

/** Folder for student profile photos, uploaded server-side by approved students. */
export const STUDENT_PHOTO_FOLDER = "darbar/students";

/** Folder for staff profile pictures, uploaded server-side by the account owner. */
export const USER_AVATAR_FOLDER = "darbar/avatars";

/**
 * Certificate PDFs live OUTSIDE `public/` because Next.js serves everything under
 * `public/` with no authentication: a PDF stored there is readable by anyone who can
 * guess the name, which bypasses `certificate.read` entirely. Only the download
 * routes (`/api/techdarbar/certificates/[id]/download` for staff and
 * `/api/student/certificates/[id]/download` for the owning student) may read them.
 */
export const CERTIFICATE_PDF_DIR = "storage/certificates";

/**
 * Stored in `Certificate.pdfUrl` as `<prefix>/<date>/<file>.pdf`. It is a private
 * lookup key resolved against CERTIFICATE_PDF_DIR, never a browser-fetchable URL —
 * a value under a public path would re-open the direct-download hole.
 */
export const CERTIFICATE_PDF_KEY_PREFIX = "/certificates";

/**
 * Ceiling for the un-paginated public content lists (blog, gallery, FAQ, team,
 * testimonials, events). Those pages render every published row, so without a
 * bound one publish action could make a cached read materialise an arbitrary
 * number of rows — plus their media joins — into every request that serves the
 * cached entry.
 * Far above the current catalogue, so nothing visible is trimmed; raise it only
 * together with real pagination.
 */
export const PUBLIC_LIST_LIMIT = 500;

/**
 * The same bound for un-paginated admin reads that are pickers rather than
 * tables: a course dropdown, the roster of tick-boxes on an assignment form,
 * the list of teachers a batch can be given. The tables page at 20–25 rows
 * (docs/05); these have no pager, so without a ceiling one big course could
 * make every admin page view materialise its entire roster.
 * Above what this campus has — 37 courses, batches well under 50 — so nothing
 * visible is trimmed; raise it only together with real pagination.
 */
export const ADMIN_PICKER_LIMIT = 500;

/** 5 MB (docs/08 §1 "max size (e.g. 5 MB)"). */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;

/**
 * docs/08 §1: signed uploads only; server enforces allowed MIME
 * (image/jpeg|png|webp|avif). SVG is intentionally excluded — editors can
 * upload script that would execute when the file is served.
 */
export const MEDIA_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type MediaAllowedMimeType = (typeof MEDIA_ALLOWED_MIME_TYPES)[number];

/** Cloudinary `format` value -> MIME type. Used to verify what was really uploaded. */
export const MEDIA_CLOUDINARY_FORMAT_TO_MIME: Record<string, MediaAllowedMimeType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};