/*
 * Content-Security-Policy (docs/08 §1 "Platform", fix guide §7, re-audit #1).
 *
 * The policy lives here, not in `next.config.mjs`, because `src/proxy.ts` is the
 * only place that runs once per HTML response. It ships *two* policies:
 *
 *  - `/techdarbar` and `/student` already render per request (they read the
 *    session), so they get a per-request nonce and no `'unsafe-inline'` in
 *    `script-src`. This is the surface where a stored XSS would reach an admin
 *    or a student session, and the nonce is what stops it.
 *  - every other path — the public site — gets a nonce-free policy. A nonce is
 *    impossible there: Next.js can only attach one while it renders, and a
 *    prerendered page has no request to take one from. Demanding a nonce
 *    therefore forces the whole site to render per request, which is re-audit
 *    performance finding #1, so public pages stay prerendered/ISR and
 *    `script-src` allows `'unsafe-inline'` — the trade-off Next.js documents
 *    for the without-nonces recipe.
 *
 * Structured data is not a casualty of that trade-off; it is the reason the
 * trade-off is cheap. `<script type="application/ld+json">` is never executed,
 * so the browser applies no `script-src` check to it (confirmed in Chrome
 * against `script-src 'self' 'nonce-…'`: an un-nonce'd JSON-LD block reports no
 * violation, while an un-nonce'd classic script is blocked). `JsonLd` is the
 * only place this app writes an inline `<script>` at all.
 *
 * Pure by design (no `next/headers`, no `server-only`) so the proxy can import it.
 */

/** Paths whose documents are rendered per request, and so can carry a nonce. */
const NONCE_PATHS = ["/techdarbar", "/student"];

/**
 * Which policy covers `path`. The trailing-slash comparison matters: a plain
 * `startsWith("/student")` would hand the admin-grade policy to a hypothetical
 * `/students-of` page, which is prerendered and cannot be nonce'd.
 */
export function usesNoncePolicy(path: string): boolean {
  return NONCE_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * A fresh, unguessable value per request. `crypto.randomUUID` is global on both the
 * Node.js and Edge runtimes; base64 keeps it inside the nonce grammar.
 */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

/** Hosts the media library is allowed to pull pictures from (docs/04 §1.5). */
const IMAGE_HOSTS = [
  // Seeded marketing imagery used to point at stock hosts; it is served from
  // `/public/images/seed` now, so `'self'` covers it and no third party needs
  // to be named here.
  "https://res.cloudinary.com",
];

/**
 * The one policy skeleton, so the two exported policies cannot drift apart
 * while only `script-src` — the directive the two surfaces disagree on — differs.
 */
function directives(scriptSrc: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Nothing on this site is meant to be embedded by another origin.
    "frame-ancestors 'none'",
    `script-src ${scriptSrc}`,
    // `'unsafe-inline'` here is not optional and not a weakness: Tailwind
    // utilities are external, but the UI sets inline `style` attributes (widths,
    // transforms), which CSP counts as inline styles. Removing it would need
    // every one of them moved to a class.
    "style-src 'self' 'unsafe-inline'",
    // `data:` is not optional: the 2FA setup QR and the avatars rendered on the
    // server are data URLs, and `blob:` backs the client-side PDF/object-URL previews.
    `img-src 'self' data: blob: ${IMAGE_HOSTS.join(" ")}`,
    "font-src 'self'",
    `connect-src 'self' https://challenges.cloudflare.com https://api.cloudinary.com${
      isDev ? " ws://localhost:* ws://127.0.0.1:*" : ""
    }`,
    // What WE embed: the campus map and the Turnstile challenge.
    "frame-src 'self' https://www.google.com https://challenges.cloudflare.com",
    "media-src 'self'",
    "manifest-src 'self'",
    // Enforced, but still reporting: `/api/csp-report` is how a blocked resource
    // that only appears in production gets noticed.
    "report-uri /api/csp-report",
    // The policy is delivered as `Content-Security-Policy`, not the report-only
    // header, so this does what it says: an http:// subresource is upgraded
    // instead of blocked. Meaningless in development, where the site is http on
    // localhost on purpose.
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * The policy for a per-request document — the staff and student surfaces.
 *
 * No `'unsafe-inline'` in `script-src`: the nonce is what allows the framework's
 * own bootstrap scripts. Hosts still match, so Turnstile's `api.js` loads
 * without one. `'unsafe-eval'` only appears in development, where React uses
 * `eval` to rebuild server stacks in the browser.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  return directives(
    `'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    isDev
  );
}

/**
 * The policy for a prerendered document — the public site.
 *
 * `script-src 'self' 'unsafe-inline'` is the documented replacement for a nonce
 * once pages are generated at build time. Inline script is only ever ours here:
 * the content of these pages comes from published, admin-authored records, and
 * the one inline element the app writes (JSON-LD) is not executed.
 */
export function buildStaticCsp(isDev: boolean): string {
  return directives(
    `'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    isDev
  );
}
