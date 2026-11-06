import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { auth } from "@/server/auth";

const handler = toNextJsHandler(auth.handler);

/**
 * Better Auth's HTTP API is an unauthenticated attack surface: posting straight
 * to `/api/auth/sign-in/email` skips the throttling, role check and audit entry
 * that `signInWithPassword` performs. The UI never calls it (every auth flow goes
 * through a server action that uses `auth.api.*` in-process), so anything outside
 * this allow-list is answered with 404 rather than 401, to leak nothing about
 * which endpoints exist (docs 01 §S2).
 */
const ALLOWED_PATHS = new Set<string>(["/get-session", "/sign-out"]);

/**
 * The one path-shaped exception: the reset link in the email is a browser
 * navigation to `/api/auth/reset-password/<token>`, which validates the token and
 * redirects to the portal's reset page. It is GET-only, needs a token nobody can
 * enumerate, and changes nothing by itself — the password only moves when the
 * reset form posts it back through the server action.
 *
 * `/verify-email` (docs 01 §S3) is the same shape: a GET with a signed 1-hour JWT
 * whose only effect is marking that one address as confirmed.
 */
const ALLOWED_GET_PREFIXES = ["/reset-password/", "/verify-email"];

function guard(req: Request): Response | null {
  const { pathname } = new URL(req.url);
  const path = pathname.replace(/^\/api\/auth/, "");
  const allowed =
    ALLOWED_PATHS.has(path) ||
    (req.method === "GET" && ALLOWED_GET_PREFIXES.some((prefix) => path.startsWith(prefix)));
  return allowed ? null : new NextResponse(null, { status: 404 });
}

export const GET = (req: Request) => guard(req) ?? handler.GET(req);

export const POST = (req: Request) => guard(req) ?? handler.POST(req);
