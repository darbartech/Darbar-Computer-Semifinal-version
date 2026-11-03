import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, isRedirectError } from "@/server/session";
import { audit } from "@/server/services/audit";
import {
  createSignedUpload,
  StorageNotConfiguredError,
  UploadValidationError,
} from "@/server/services/storage";
import { signUploadSchema } from "@/lib/validators/media";

export const runtime = "nodejs";

/**
 * POST /api/upload/sign
 *
 * Returns the signed Cloudinary upload parameters for one image
 * (docs/06 §9, docs/04 §1.5). The file itself never passes through Next.js —
 * the browser uploads it directly to Cloudinary.
 *
 * Role check: `media.upload`, so COUNSELOR (no media access, docs/05 §2) is
 * rejected even though docs/06 §9 says "any staff role".
 */
export async function POST(request: Request) {
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

  try {
    const user = await requirePermission("media.upload");

    const signed = createSignedUpload({
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
    });

    await audit({
      actor: { id: user.id, email: user.email },
      action: "media.sign",
      entity: "Media",
      entityId: null,
      summary: "Issued upload signature",
      meta: { mimeType: parsed.data.mimeType, folder: signed.limits.folder },
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