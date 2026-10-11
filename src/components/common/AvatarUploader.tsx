"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_MAX_BYTES } from "@/server/constants";
import { cn } from "@/lib/utils";

/**
 * Profile picture picker for the account owner. Both `uploadOwnAvatarAction`
 * (staff) and `uploadStudentPhotoAction` (students) return `{ photoUrl }`, so
 * the page only supplies the action and the current URL.
 */

export type AvatarUploadResult =
  | { ok: true; data: { photoUrl: string } }
  | { ok: false; error: string };

export type AvatarUploaderProps = {
  displayName: string;
  photoUrl: string | null;
  uploadAction: (formData: FormData) => Promise<AvatarUploadResult>;
  className?: string;
};

export function AvatarUploader({
  displayName,
  photoUrl,
  uploadAction,
  className,
}: AvatarUploaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pendingUrl, setPendingUrl] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);

  const shownUrl = pendingUrl ?? photoUrl;
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset first so picking the same file again still fires change.
    event.target.value = "";
    if (!file || isUploading) return;

    if (!(MEDIA_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast({ title: "Use a JPG, PNG, WebP or AVIF image", variant: "error" });
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      toast({
        title: `Image is too large (max ${Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB)`,
        variant: "error",
      });
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPendingUrl(objectUrl);
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    let result: AvatarUploadResult;
    try {
      result = await uploadAction(formData);
    } catch {
      // The action can be rejected before it ever runs — Next.js caps the
      // request body (serverActions.bodySizeLimit), and the connection can
      // drop mid-upload — so there is no result object to inspect. Without this
      // the spinner would keep turning forever.
      setIsUploading(false);
      setPendingUrl(null);
      URL.revokeObjectURL(objectUrl);
      toast({
        title: "Upload failed. Try a smaller image or check your connection.",
        variant: "error",
      });
      return;
    }

    setIsUploading(false);
    URL.revokeObjectURL(objectUrl);

    if (!result.ok) {
      setPendingUrl(null);
      toast({ title: result.error, variant: "error" });
      return;
    }

    setPendingUrl(result.data.photoUrl);
    toast({ title: "Profile picture updated", variant: "success" });
    router.refresh();
  };

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative size-20 shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100">
        {shownUrl ? (
          <Image
            src={shownUrl}
            alt={`${displayName}'s profile picture`}
            fill
            className="object-cover"
            unoptimized={shownUrl.startsWith("blob:")}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-primary/70">
            {initials || <Camera className="size-6" aria-hidden="true" />}
          </span>
        )}
        {isUploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept={MEDIA_ALLOWED_MIME_TYPES.join(",")}
          className="sr-only"
          onChange={handleFile}
          disabled={isUploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          <Camera className="size-4" aria-hidden="true" />
          {isUploading ? "Uploading…" : photoUrl ? "Change picture" : "Upload picture"}
        </Button>
        <p className="mt-1.5 text-xs text-neutral-500">
          JPG, PNG, WebP or AVIF, up to {Math.floor(MEDIA_MAX_BYTES / (1024 * 1024))} MB. A square
          image looks best.
        </p>
      </div>
    </div>
  );
}
