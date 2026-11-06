import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, isRedirectError } from "@/server/session";
import { allow } from "@/server/services/rate-limit";
import {
  createSignedUpload,
  StorageNotConfiguredError,
  UploadValidationError,
} from "@/server/services/storage";
import { signUploadSchema } from "@/lib/validators/media";

export const runtime = "nodejs";

/**
 * A signed URL is a per-user quota problem, not an anonymous one: the caller is
 * already authenticated, so the counter is keyed by user id and 60 signatures in
 * ten minutes covers a busy media session (bulk gallery upload) without letting
 * one account mint signatures forever.
 */
const SIGN_LIMIT = { max: 60, windowMinutes: 10 };

/**
 * POST /api/upload/sign
 *
 * Returns the signed Cloudinary upload parameters for one image
 * (docs/06 §9, docs/04 §1.5). The file itself never passes through Next.js —
 * the browser uploads it directly to Cloudinary.
 *
 * Role check: `media.upload`, so COUNSELOR (no media access, docs/05 §2) is
 * rejected even though docs/06 §9 says "any staff role".
 *
 * Deliberately *not* audited: issuing a signature is a read of the config plus an
 * HMAC, and it changes nothing. The upload it enables is audited as
 * `media.upload` (or rejected as `media.upload.rejected`) when the browser comes
 * back with the result, so the useful event survives without one row per keystroke
 * of the picker (fix guide §8 Fix B).
 */
export async function POST(request: Request) {
  try {
    // Guard and throttle before the body is touched (`src/app/api/upload/local/route.ts`
    // does the same, and for the same reason): parsing a request costs the server
    // work, and an anonymous or over-quota caller should not be able to make it
    // spend that work at all. A refusal here is also a refusal on a request whose
    // `mimeType`/`sizeBytes` we never looked at, which keeps the error surface
    // from describing files the caller is not allowed to upload.
    const user = await requirePermission("media.upload");

    if (!(await allow(`upload-sign:${user.id}`, SIGN_LIMIT))) {
      return NextResponse.json(
        { error: "Too many uploads. Try again later." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = signUploadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please fix the highlighted fields",
          fieldErrors: z.flattenError(parsed.error).fieldErrors,
        },
        { status: 400 }
      );
    }

    const signed = createSignedUpload({
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
    });

    return NextResponse.json(signed, { status: 200 });
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      // The thrown message names the missing env vars. That is useful in the
      // server log and pointless (slightly leaky) in a browser response.
      console.error("[upload/sign] storage not configured", error.message);
      return NextResponse.json(
        { error: "Image hosting is not configured. Please contact the site administrator." },
        { status: 503 }
      );
    }
    if (error instanceof UploadValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes("FORBIDDEN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // `requireUser` redirects when there is no session or the user is
    // deactivated; a Route Handler cannot redirect a missing session, so map
    // it to 401.
    if (isRedirectError(error)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error(
      "[upload/sign]",
      error instanceof Error ? error.message : "unknown"
    );
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}