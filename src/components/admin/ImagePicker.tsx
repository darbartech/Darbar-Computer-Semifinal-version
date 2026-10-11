"use client";
import * as React from "react";
import Image from "next/image";
import {
  Upload,
  Loader2,
  ImageIcon,
  Check,
  Trash2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useMediaUpload } from "@/components/admin/useMediaUpload";
import { addMediaByUrl } from "@/server/actions/media";
import { cn } from "@/lib/utils";

export type PickedImage = {
  id: string;
  url: string;
  alt: string;
} | null;

export type LibraryImage = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

type PickerMode = "upload" | "browse" | "link";

interface ImagePickerProps {
  label?: string;
  /** Current value, controlled. `null` means nothing selected. */
  value: PickedImage;
  onChange: (value: PickedImage) => void;
  /** Recent library images, passed in from the server component. */
  library?: LibraryImage[];
  /** Hint shown under the field, e.g. "Recommended 1600 x 900". */
  hint?: string;
  disabled?: boolean;
}

const MODES: { value: PickerMode; label: string }[] = [
  { value: "upload", label: "Upload file" },
  { value: "browse", label: "Media library" },
  { value: "link", label: "From URL" },
];

/**
 * Cover/avatar picker (docs/05 §7 `ImagePicker`, docs/04 §1.5).
 *
 * Three ways to set an image: upload a new file, choose one already in the
 * media library, or point at a URL that is hosted elsewhere. Alt text is
 * mandatory in all three (docs/08 §1), because every image on the public site
 * needs it.
 */
export function ImagePicker({
  label = "Image",
  value,
  onChange,
  library = [],
  hint,
  disabled = false,
}: ImagePickerProps) {
  const { toast } = useToast();
  const { upload, isUploading, accept } = useMediaUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [mode, setMode] = React.useState<PickerMode>("upload");
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [altDraft, setAltDraft] = React.useState("");
  const [altTouched, setAltTouched] = React.useState(false);
  const [urlDraft, setUrlDraft] = React.useState("");
  const [isAddingUrl, setIsAddingUrl] = React.useState(false);
  const [urlError, setUrlError] = React.useState<string | null>(null);

  const openDialog = React.useCallback((next: PickerMode) => {
    setMode(next);
    setPendingFile(null);
    setAltDraft("");
    setAltTouched(false);
    setUrlDraft("");
    setUrlError(null);
    setDialogOpen(true);
  }, []);

  const closeDialog = () => {
    if (isUploading || isAddingUrl) return;
    setDialogOpen(false);
    setPendingFile(null);
    setAltDraft("");
    setUrlDraft("");
    setUrlError(null);
  };

  const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failed attempt.
    event.target.value = "";
    if (!file) return;
    setPendingFile(file);
    setAltDraft("");
    setAltTouched(false);
  };

  const altError =
    altTouched && !altDraft.trim() ? "Alt text is required" : undefined;

  const confirmUpload = async () => {
    setAltTouched(true);
    if (!pendingFile || !altDraft.trim()) return;

    const uploaded = await upload(pendingFile, altDraft);
    if (!uploaded) return;

    onChange(uploaded);
    toast({ title: "Image uploaded", variant: "success" });
    closeDialog();
  };

  const confirmUrl = async () => {
    if (!urlDraft.trim()) {
      setUrlError("URL is required");
      return;
    }
    setIsAddingUrl(true);
    setUrlError(null);
    const result = await addMediaByUrl({
      url: urlDraft.trim(),
      alt: altDraft.trim(),
    });
    setIsAddingUrl(false);
    if (!result.ok) {
      setUrlError(result.error);
      return;
    }
    onChange({ id: result.data.id, url: result.data.url, alt: result.data.alt });
    toast({ title: "Image added from URL", variant: "success" });
    closeDialog();
  };

  const chooseFromLibrary = (image: LibraryImage) => {
    onChange({ id: image.id, url: image.url, alt: image.alt });
    toast({ title: "Image selected", variant: "success" });
    closeDialog();
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {value ? (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:flex-row sm:items-start">
          <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
            <Image
              src={value.url}
              alt={value.alt || ""}
              fill
              sizes="96px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-xs text-neutral-500 font-mono">
              {value.url}
            </p>
            <p className="text-sm text-neutral-700">
              <span className="font-medium text-neutral-500">Alt text: </span>
              {value.alt}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => openDialog("browse")}
              >
                <ImageIcon className="size-4" />
                Change
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => openDialog("link")}
              >
                <Link2 className="size-4" />
                Use a URL
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => onChange(null)}
                className="text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={disabled}
            onClick={() => openDialog("upload")}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50/60 px-6 py-10 text-center transition-colors",
              "hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10",
              "disabled:pointer-events-none disabled:opacity-50"
            )}
          >
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload className="size-5" />
            </span>
            <span className="text-sm font-medium text-neutral-800">
              Upload an image
            </span>
            <span className="text-xs text-neutral-500">
              JPEG, PNG, WebP or AVIF up to 5 MB
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => openDialog("link")}
            className="h-auto shrink-0 px-4 py-3 sm:self-stretch"
          >
            <Link2 className="size-4" />
            Use a URL
          </Button>
        </div>
      )}

      {hint && <p className="text-xs text-neutral-500">{hint}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={onFileSelected}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode === "browse"
                ? "Choose from media library"
                : mode === "link"
                  ? "Add an image from a URL"
                  : "Upload an image"}
            </DialogTitle>
            <DialogDescription>
              {mode === "browse"
                ? "Pick an image that is already in the library."
                : mode === "link"
                  ? "Use a public https:// URL for an image that is hosted elsewhere."
                  : "Alt text is required so the image is described for screen readers and search engines."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-1 px-6">
            {MODES.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={mode === item.value ? "default" : "ghost"}
                onClick={() => {
                  setMode(item.value);
                  setUrlError(null);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="px-6 pb-2">
            {mode === "browse" ? (
              library.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">
                  The media library is empty. Upload something first.
                </p>
              ) : (
                <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
                  {library.map((image) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => chooseFromLibrary(image)}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/10"
                    >
                      <Image
                        src={image.url}
                        alt={image.alt || ""}
                        fill
                        sizes="(max-width: 640px) 33vw, 150px"
                        className="object-cover transition-transform group-hover:scale-105"
                        unoptimized
                      />
                      <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-left text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        {image.alt || "No alt text"}
                      </span>
                    </button>
                  ))}
                </div>
              )
            ) : mode === "link" ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="image-picker-url">
                    Image URL <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="image-picker-url"
                    value={urlDraft}
                    onChange={(event) => {
                      setUrlDraft(event.target.value);
                      setUrlError(null);
                    }}
                    placeholder="https://images.example.com/cover.jpg"
                    disabled={isAddingUrl}
                    aria-invalid={!!urlError}
                    aria-describedby={urlError ? "image-picker-url-error" : undefined}
                    className={cn(urlError && "border-destructive")}
                  />
                  <p
                    id="image-picker-url-error"
                    className={cn(
                      "text-xs",
                      urlError ? "text-destructive" : "text-neutral-500"
                    )}
                  >
                    {urlError ??
                      "Public https:// links only. The image is not copied to this site."}
                  </p>
                </div>

                {urlDraft.trim() && !urlError && (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                    <Image
                      src={urlDraft.trim()}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 640px"
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="image-picker-link-alt">
                    Alt text <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="image-picker-link-alt"
                    value={altDraft}
                    onChange={(event) => {
                      setAltDraft(event.target.value);
                      setAltTouched(true);
                    }}
                    onBlur={() => setAltTouched(true)}
                    placeholder="Students working at computers in the DarbarTech lab"
                    maxLength={200}
                    disabled={isAddingUrl}
                    aria-invalid={!!altError}
                    aria-describedby={altError ? "image-picker-link-alt-error" : undefined}
                    className={cn(altError && "border-destructive")}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <p
                      id="image-picker-link-alt-error"
                      className={cn(
                        "text-xs",
                        altError ? "text-destructive" : "text-neutral-500"
                      )}
                    >
                      {altError ?? "Describe the image, not the file name."}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {altDraft.length}/200
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="image-picker-file" className="text-xs">
                    File
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1.5"
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    {pendingFile ? "Choose a different file" : "Choose a file"}
                  </Button>
                  {pendingFile ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-neutral-700">
                      <Check className="size-3.5 shrink-0 text-success" />
                      <span className="truncate">{pendingFile.name}</span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {(pendingFile.size / 1024).toFixed(0)} KB
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-500">
                      JPEG, PNG, WebP or AVIF up to 5 MB. SVG is not allowed.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="image-picker-alt">
                    Alt text <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="image-picker-alt"
                    value={altDraft}
                    onChange={(event) => {
                      setAltDraft(event.target.value);
                      setAltTouched(true);
                    }}
                    onBlur={() => setAltTouched(true)}
                    placeholder="Students working at computers in the DarbarTech lab"
                    maxLength={200}
                    disabled={!pendingFile || isUploading}
                    aria-invalid={!!altError}
                    aria-describedby={altError ? "image-picker-alt-error" : undefined}
                    className={cn(altError && "border-destructive")}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <p
                      id="image-picker-alt-error"
                      className={cn(
                        "text-xs",
                        altError ? "text-destructive" : "text-neutral-500"
                      )}
                    >
                      {altError ?? "Describe the image, not the file name."}
                    </p>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {altDraft.length}/200
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={closeDialog} disabled={isUploading || isAddingUrl}>
              Cancel
            </Button>
            {mode === "browse" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("upload")}
                disabled={isUploading}
              >
                <Upload className="size-4" />
                Upload instead
              </Button>
            )}
            {mode === "link" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setMode("upload")}
                disabled={isAddingUrl}
              >
                <Upload className="size-4" />
                Upload instead
              </Button>
            )}
            {mode === "upload" && (
              <Button
                type="button"
                onClick={confirmUpload}
                disabled={isUploading || !pendingFile || !altDraft.trim()}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload
              </Button>
            )}
            {mode === "link" && (
              <Button
                type="button"
                onClick={confirmUrl}
                disabled={isAddingUrl || !urlDraft.trim() || !altDraft.trim()}
              >
                {isAddingUrl ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                Add image
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ImagePickerSkeleton() {
  return <Skeleton className="h-32 w-full rounded-xl" />;
}

