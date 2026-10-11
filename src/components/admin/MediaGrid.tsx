"use client";
import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Loader2,
  Search,
  Upload,
  Link2,
  ImageOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/common/Badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useMediaUpload } from "@/components/admin/useMediaUpload";
import { deleteMedia, updateMediaAltText } from "@/server/actions/media";
import { cn } from "@/lib/utils";
import type { MediaListItem } from "@/server/dal/media";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type MediaGridProps = {
  items: MediaListItem[];
  total: number;
  page: number;
  pageCount: number;
  query: string;
  /** False for EDITOR (docs/05 §2: delete is admin-only). */
  canDelete: boolean;
  canUpload: boolean;
};

export function MediaGrid({
  items,
  total,
  page,
  pageCount,
  query,
  canDelete,
  canUpload,
}: MediaGridProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { upload, isUploading, accept } = useMediaUpload();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [search, setSearch] = React.useState(query);

  const [editing, setEditing] = React.useState<MediaListItem | null>(null);
  const [altDraft, setAltDraft] = React.useState("");
  const [altTouched, setAltTouched] = React.useState(false);
  const [savingAlt, setSavingAlt] = React.useState(false);

  const [deleting, setDeleting] = React.useState<MediaListItem | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const [uploadingAlt, setUploadingAlt] = React.useState<File | null>(null);
  const [uploadAltDraft, setUploadAltDraft] = React.useState("");

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    const trimmed = search.trim();
    if (trimmed) params.set("q", trimmed);
    router.push(params.size ? `/admin/media?${params}` : "/admin/media");
  };

  const saveAlt = async () => {
    if (!editing) return;
    setAltTouched(true);
    if (!altDraft.trim()) return;

    setSavingAlt(true);
    const result = await updateMediaAltText({ id: editing.id, alt: altDraft.trim() });
    setSavingAlt(false);

    if (!result.ok) {
      toast({ title: "Could not save", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Alt text saved", variant: "success" });
    setEditing(null);
    router.refresh();
  };

  const removeMedia = async () => {
    if (!deleting) return;
    setConfirmDelete(true);
    const result = await deleteMedia({ id: deleting.id });
    setConfirmDelete(false);

    if (!result.ok) {
      toast({ title: "Could not delete", description: result.error, variant: "error" });
      return;
    }
    toast({ title: "Image deleted", variant: "success" });
    setDeleting(null);
    router.refresh();
  };

  const onUploadFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingAlt(file);
    setUploadAltDraft("");
  };

  const confirmUpload = async () => {
    if (!uploadingAlt || !uploadAltDraft.trim()) return;
    const uploaded = await upload(uploadingAlt, uploadAltDraft);
    if (!uploaded) return;
    toast({ title: "Image uploaded", variant: "success" });
    setUploadingAlt(null);
    setUploadAltDraft("");
    router.refresh();
  };

  const altError =
    altTouched && !altDraft.trim() ? "Alt text is required" : undefined;
  const uploadAltError =
    uploadingAlt && !uploadAltDraft.trim() ? "Alt text is required" : undefined;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={submitSearch} className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search alt text or URL"
            aria-label="Search the media library"
            className="bg-white pl-9"
          />
        </form>

        {canUpload && (
          <>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              onChange={onUploadFileSelected}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
          </>
        )}
      </div>

      <p className="text-sm text-neutral-500">
        {total} image{total === 1 ? "" : "s"}
        {query ? ` matching "${query}"` : ""}
      </p>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300 bg-white/60 px-6 py-16 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            <ImageOff className="size-6" />
          </span>
          <p className="text-sm font-medium text-neutral-800">
            {query ? "No images match your search" : "The media library is empty"}
          </p>
          <p className="max-w-sm text-xs text-neutral-500">
            {canUpload
              ? "Upload an image to use it as a cover, gallery photo or team photo."
              : "Ask a colleague with upload access to add an image."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm"
            >
              <div className="relative aspect-square bg-neutral-100">
                <Image
                  src={item.url}
                  alt={item.alt || ""}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
                  className="object-cover"
                />
                {!item.alt && (
                  <span className="absolute left-2 top-2">
                    <Badge variant="warning">No alt text</Badge>
                  </span>
                )}
                {item.usageCount > 0 && (
                  <span className="absolute bottom-2 left-2">
                    <Badge variant="secondary">
                      <Link2 className="size-3" />
                      {item.usageCount}
                    </Badge>
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="line-clamp-2 text-xs text-neutral-700" title={item.alt}>
                  {item.alt || "—"}
                </p>
                <p className="text-[11px] text-neutral-400">
                  {item.mimeType ? item.mimeType.replace("image/", "") : "image"}
                  {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                  {item.bytes ? ` · ${formatBytes(item.bytes)}` : ""}
                </p>

                <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setEditing(item);
                      setAltDraft(item.alt);
                      setAltTouched(false);
                    }}
                  >
                    <Pencil className="size-3" />
                    Alt
                  </Button>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={item.usageCount > 0}
                      title={
                        item.usageCount > 0
                          ? `Used in ${item.usageCount} place${
                              item.usageCount === 1 ? "" : "s"
                            } — detach it first`
                          : "Delete this image"
                      }
                      onClick={() => setDeleting(item)}
                      className="text-destructive hover:bg-destructive/5"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => router.push(buildPageHref(query, page - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-neutral-600">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => router.push(buildPageHref(query, page + 1))}
          >
            Next
          </Button>
        </nav>
      )}

      {/* Edit alt text */}
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit alt text</DialogTitle>
            <DialogDescription>
              Alt text is required. Describe what the image shows, not the file
              name.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2">
            {editing && (
              <div className="mb-4 flex gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border border-neutral-200">
                  <Image
                    src={editing.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <p className="min-w-0 self-center break-all text-xs text-neutral-500">
                  {editing.url}
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="media-alt">
                Alt text <span className="text-destructive">*</span>
              </Label>
              <Input
                id="media-alt"
                value={altDraft}
                onChange={(event) => {
                  setAltDraft(event.target.value);
                  setAltTouched(true);
                }}
                onBlur={() => setAltTouched(true)}
                maxLength={200}
                aria-invalid={!!altError}
                aria-describedby={altError ? "media-alt-error" : undefined}
                className={cn(altError && "border-destructive")}
              />
              <div className="flex items-start justify-between gap-2">
                <p
                  id="media-alt-error"
                  className={cn(
                    "text-xs",
                    altError ? "text-destructive" : "text-neutral-500"
                  )}
                >
                  {altError ?? `${altDraft.length}/200 characters`}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={savingAlt}
            >
              Cancel
            </Button>
            <Button type="button" onClick={saveAlt} disabled={savingAlt}>
              {savingAlt && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this image?</DialogTitle>
            <DialogDescription>
              This permanently removes the file from storage. It cannot be undone.
              {deleting && deleting.usageCount === 0
                ? " Nothing currently uses this image."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(null)}
              disabled={confirmDelete}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={removeMedia}
              disabled={confirmDelete}
            >
              {confirmDelete && <Loader2 className="size-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload with required alt text */}
      <Dialog
        open={uploadingAlt !== null}
        onOpenChange={(open) => {
          if (!open && !isUploading) setUploadingAlt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload an image</DialogTitle>
            <DialogDescription>
              Alt text is required before the upload starts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-2">
            {uploadingAlt && (
              <p className="text-sm text-neutral-700">
                <span className="font-medium">{uploadingAlt.name}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  {(uploadingAlt.size / 1024).toFixed(0)} KB
                </span>
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="media-upload-alt">
                Alt text <span className="text-destructive">*</span>
              </Label>
              <Input
                id="media-upload-alt"
                value={uploadAltDraft}
                onChange={(event) => setUploadAltDraft(event.target.value)}
                placeholder="Students working at computers in the DarbarTech lab"
                maxLength={200}
                autoFocus
                aria-invalid={!!uploadAltError}
                aria-describedby={
                  uploadAltError ? "media-upload-alt-error" : undefined
                }
                className={cn(uploadAltError && "border-destructive")}
              />
              <p
                id="media-upload-alt-error"
                className={cn(
                  "text-xs",
                  uploadAltError ? "text-destructive" : "text-neutral-500"
                )}
              >
                {uploadAltError ?? "Describe the image for screen readers."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUploadingAlt(null)}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmUpload}
              disabled={isUploading || !uploadingAlt || !uploadAltDraft.trim()}
            >
              {isUploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildPageHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/admin/media?${qs}` : "/admin/media";
}

export function MediaGridSkeleton() {
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <li
          key={index}
          className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3"
        >
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}