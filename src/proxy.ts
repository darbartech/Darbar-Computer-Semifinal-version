import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_PASSWORD_FORGOT_PATH,
  ADMIN_PASSWORD_RESET_PATH,
  SECURE_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/server/constants";
import { buildCsp, buildStaticCsp, createNonce, usesNoncePolicy } from "@/lib/csp";

/** Staff URLs reachable without a session (docs 01 §S4). */
const PUBLIC_STAFF_ROUTES = new Set([
  ADMIN_LOGIN_PATH,
  ADMIN_PASSWORD_FORGOT_PATH,
  ADMIN_PASSWORD_RESET_PATH,
]);

const isDev = process.env.NODE_ENV === "development";

/**
 * Convenience redirect only (docs/02 §4 layer 1). This is NOT the security
 * boundary: `techdarbar/(protected)/layout.tsx` re-checks the session on the
 * server, and every Server Action / DAL write calls `requirePermission`.
 *
 * Better Auth's full session check needs the Node.js runtime (it verifies a
 * signed cookie and, on cache miss, reads the session row). Next.js 16 runs
 * `proxy.ts` on the Node.js runtime by default, so a real verification here is
 * possible; it is still paired with the layout check.
 *
 * The same function also owns the Content-Security-Policy (fix guide §7, re-audit
 * #1) because it is the only place that runs once per HTML response. It picks the
 * policy from the path: `script-src 'nonce-…'` for the two signed-in surfaces,
 * which render per request and so can mint a fresh value, and a nonce-free policy
 * for everything else, which is prerendered and could not carry one. The nonce
 * travels inside the CSP header — that is how Next.js discovers it and attaches
 * the same value to the scripts and styles it injects itself.
 */
export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  const withNonce = usesNoncePolicy(path);
  const csp = withNonce ? buildCsp(createNonce(), isDev) : buildStaticCsp(isDev);

  const isAdminRoute = path.startsWith("/techdarbar");
  // The staff pages a signed-out person must reach: login, and both halves of
  // the forgot-password flow (the email link lands on the reset page).
  const isPublicStaffRoute = PUBLIC_STAFF_ROUTES.has(path);

  if (isAdminRoute && !isPublicStaffRoute) {
    // Production uses `__Secure-` prefixed cookies; checking only the dev name
    // would bounce every signed-in staff member back to the login page.
    const sessionCookie =
      req.cookies.get(SECURE_SESSION_COOKIE_NAME) ??
      req.cookies.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      const loginUrl = new URL(ADMIN_LOGIN_PATH, nextUrl);
      // Preserve the intended destination so login can bounce back to it.
      if (path !== "/techdarbar") loginUrl.searchParams.set("next", path);
      // A redirect body is still HTML the browser renders, so it gets the policy.
      return NextResponse.redirect(loginUrl, {
        headers: { "Content-Security-Policy": csp },
      });
    }
  }

  // Setting it on the response is what the browser enforces. Forwarding it on
  // the request only matters for the nonce policy: that is how Next.js discovers
  // the value and attaches it to the scripts and styles it injects itself. A
  // prerendered page has no request to read one from, so nothing is forwarded.
  if (!withNonce) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * CSP has to reach every HTML document, so: all paths except the API routes
     * (JSON — nothing renders), the framework's static assets and the media the
     * app serves from /uploads and /images. Prefetches are skipped: an RSC
     * prefetch is not a document, and the protected layout re-checks the session
     * on the navigation that follows.
     */
    {
      source:
        "/((?!api/|_next/static|_next/image|uploads/|images/|favicon.ico|icon.svg|apple-touch-icon.svg|site.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    // The auth redirect keeps covering the whole admin surface, prefetches included.
    "/techdarbar/:path*",
  ],
};
