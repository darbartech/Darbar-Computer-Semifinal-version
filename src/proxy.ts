import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_LOGIN_PATH, SECURE_SESSION_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/server/constants";

/**
 * Convenience redirect only (docs/02 §4 layer 1). This is NOT the security
 * boundary: `admin/(protected)/layout.tsx` re-checks the session on the
 * server, and every Server Action / DAL write calls `requirePermission`.
 *
 * Better Auth's full session check needs the Node.js runtime (it verifies a
 * signed cookie and, on cache miss, reads the session row). Next.js 16 runs
 * `proxy.ts` on the Node.js runtime by default, so a real verification here is
 * possible; it is still paired with the layout check.
 */
export async function proxy(req: NextRequest) {
  const { nextUrl } = req;
  const path = nextUrl.pathname;

  const isAdminRoute = path.startsWith("/admin");
  const isLoginRoute = path === ADMIN_LOGIN_PATH;

  if (isAdminRoute && !isLoginRoute) {
    // Production uses `__Secure-` prefixed cookies; checking only the dev name
    // would bounce every signed-in staff member back to the login page.
    const sessionCookie =
      req.cookies.get(SECURE_SESSION_COOKIE_NAME) ??
      req.cookies.get(SESSION_COOKIE_NAME);

    if (!sessionCookie?.value) {
      const loginUrl = new URL(ADMIN_LOGIN_PATH, nextUrl);
      // Preserve the intended destination so login can bounce back to it.
      if (path !== "/admin") loginUrl.searchParams.set("next", path);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything under /admin except the login page itself.
    "/admin/:path*",
  ],
};