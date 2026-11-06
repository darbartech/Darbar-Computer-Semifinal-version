"use server";
import "server-only";
import { isRedirectError, requireSessionUser } from "@/server/session";
import { audit } from "@/server/services/audit";
import { invalidate, USER_TAGS } from "@/server/revalidate";
import { destroyAsset } from "@/server/services/storage";
import { storeAvatarImage } from "@/server/services/avatar";
import { USER_AVATAR_FOLDER } from "@/server/constants";
import { createMedia, deleteMediaRow, findMediaByUrl } from "@/server/dal/media";
import { adminGetUser, setUserImage } from "@/server/dal/users";

/**
 * Self-service profile picture for staff accounts.
 *
 * Guarded by "signed in as a non-student account", not by `media.upload`: the
 * owner of an account may always change its own picture, including COUNSELOR
 * roles that have no media-library rights. Students use
 * `uploadStudentPhotoAction`, which writes their `StudentProfile` photo.
 */

export type AvatarActionResult =
  | { ok: true; data: { photoUrl: string } }
  | { ok: false; error: string };

const GENERIC_FAILURE = "Upload failed. Please try again.";

export async function uploadOwnAvatarAction(
  formData: FormData
): Promise<AvatarActionResult> {
  let actor: { id: string; email: string } | null = null;
  try {
    // The owner's own account page, which stays open before two-factor exists,
    // so this uses the ungated primitive and checks the role itself.
    const user = await requireSessionUser();
    if (user.role === "STUDENT") {
      return { ok: false, error: "Students update their photo from their own profile." };
    }
    actor = { id: user.id, email: user.email };

    const storedResult = await storeAvatarImage(formData.get("file"), USER_AVATAR_FOLDER);
    if (!storedResult.ok) return { ok: false, error: storedResult.error };
    const stored = storedResult.stored;

    await createMedia({
      url: stored.url,
      publicId: stored.publicId,
      alt: `${user.name}'s profile picture`,
      width: stored.width,
      height: stored.height,
      bytes: stored.bytes,
      mimeType: stored.mimeType,
      folder: USER_AVATAR_FOLDER,
      uploadedById: user.id,
    });

    const previousImage = (await adminGetUser(user.id))?.image;
    await setUserImage(user.id, stored.url);

    if (previousImage) {
      const previous = await findMediaByUrl(previousImage);
      // The file and its library row both go, so the replaced picture leaves
      // nothing behind (same cleanup the student photo action does).
      if (previous) {
        if (previous.publicId) await destroyAsset(previous.publicId);
        await deleteMediaRow(previous.id);
      }
    }

    await audit({
      actor,
      action: "user.avatar.upload",
      entity: "User",
      entityId: user.id,
      summary: "Updated own profile picture",
      meta: { mimeType: stored.mimeType, bytes: stored.bytes },
    });

    invalidate(...USER_TAGS);
    return { ok: true, data: { photoUrl: stored.url } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[uploadOwnAvatarAction]", error instanceof Error ? error.message : "unknown");
    return { ok: false, error: GENERIC_FAILURE };
  }
}
