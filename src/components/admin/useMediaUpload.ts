"use client";
import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { registerMediaUpload } from "@/server/actions/media";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES } from "@/server/constants";

export type UploadedMedia = {
  id: string;
  url: string;
  alt: string;
};

type SignedUpload = {
  uploadUrl: string;
  fields: Record<string, string | number>;
  limits: { maxBytes: number; allowedMimeTypes: readonly string[]; folder: string };
};

const ACCEPT = MEDIA_ALLOWED_MIME_TYPES.join(",");

/**
 * Three-step upload, per docs/04 §1.5 and docs/08 §1:
 *   1. ask our server for a signed parameter set (role-checked, MIME + size
 *      limits enforced here already),
 *   2. POST the file straight to storage — Cloudinary in production, the local
 *      `POST /api/upload/local` route while no credentials are configured,
 *   3. tell our server what storage returned, so it can re-verify before
 *      writing the `Media` row (the browser relays that response, so it is
 *      untrusted).
 *
 * With Cloudinary the file never passes through the Next.js server.
 */
export function useMediaUpload() {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const upload = React.useCallback(
    async (file: File, alt: string): Promise<UploadedMedia | null> => {
      const trimmedAlt = alt.trim();
      if (!trimmedAlt) {
        toast({
          title: "Alt text is required",
          description: "Describe the image for screen readers and search engines.",
          variant: "error",
        });
        return null;
      }

      if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `Allowed types: ${MEDIA_ALLOWED_MIME_TYPES.join(", ")}`,
          variant: "error",
        });
        return null;
      }
      if (file.size > MEDIA_MAX_BYTES) {
        toast({
          title: "File is too large",
          description: `Maximum size is ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB`,
          variant: "error",
        });
        return null;
      }

      setIsUploading(true);
      setProgress(0);

      try {
        const signResponse = await fetch("/api/upload/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
        });

        const signBody = await signResponse.json().catch(() => null);
        if (!signResponse.ok) {
          toast({
            title: "Upload not allowed",
            description:
              signBody?.error ?? "Could not start the upload. Please try again.",
            variant: "error",
          });
          return null;
        }

        const signed = signBody as SignedUpload;

        // Direct browser -> storage upload. Only the local provider accepts
        // extra fields (a signed Cloudinary POST rejects unsigned parameters),
        // so the measured dimensions ride along for local uploads only.
        const formData = new FormData();
        formData.append("file", file);
        for (const [key, value] of Object.entries(signed.fields)) {
          formData.append(key, String(value));
        }
        if (signed.uploadUrl.startsWith("/")) {
          const size = await measureImage(file);
          if (size.width) formData.append("width", String(size.width));
          if (size.height) formData.append("height", String(size.height));
        }

        const cloudinaryResponse = await fetch(signed.uploadUrl, {
          method: "POST",
          body: formData,
        });
        const uploaded = await cloudinaryResponse.json().catch(() => null);

        if (!cloudinaryResponse.ok || !uploaded || uploaded.error) {
          toast({
            title: "Upload failed",
            description: uploaded?.error?.message ?? "Please try again.",
            variant: "error",
          });
          return null;
        }
        setProgress(80);

        const result = await registerMediaUpload({
          publicId: uploaded.public_id,
          secureUrl: uploaded.secure_url,
          bytes: uploaded.bytes,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
          resourceType: uploaded.resource_type,
          alt: trimmedAlt,
        });

        if (!result.ok) {
          toast({
            title: "Upload rejected",
            description: result.error,
            variant: "error",
          });
          return null;
        }

        setProgress(100);
        return result.data;
      } catch {
        toast({
          title: "Upload failed",
          description: "Please check your connection and try again.",
          variant: "error",
        });
        return null;
      } finally {
        setIsUploading(false);
        setProgress(0);
      }
    },
    [toast]
  );

  return { upload, isUploading, progress, accept: ACCEPT };
}

/**
 * Intrinsic size of the picked file, for the media library grid. Purely
 * decorative metadata: the server treats these numbers as untrusted and only
 * stores them when they are positive integers.
 */
async function measureImage(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}