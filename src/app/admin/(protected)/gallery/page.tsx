import type { Metadata } from "next";
import { Images, Plus, Trash2, Edit3, Save } from "lucide-react";
import Image from "next/image";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { requirePermission } from "@/server/session";
import { adminListGalleryItems } from "@/server/dal/gallery";
import { saveGalleryItem, deleteGalleryItemAction } from "@/server/actions/gallery";
import { listRecentMedia } from "@/server/dal/media";
import { GALLERY_CATEGORIES } from "@/lib/validators/gallery";
import { GalleryNewForm, GalleryEditForm } from "@/components/admin/GalleryForms";

export const metadata: Metadata = {
  title: "Gallery Manager",
  robots: { index: false, follow: false },
};

async function handleDeleteGalleryItem(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  return deleteGalleryItemAction(id);
}

export default async function AdminGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("gallery.write");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = {
    q: raw.q,
    category: raw.category,
    isPublished: raw.isPublished,
    page: raw.page ? parseInt(raw.page, 10) : 1,
  };

  const [result, recentMedia] = await Promise.all([
    adminListGalleryItems(filters),
    listRecentMedia(48),
  ]);

  const libraryImages = recentMedia.map((m) => ({
    id: m.id,
    url: m.url,
    alt: m.alt,
    width: m.width,
    height: m.height,
  }));

  const categoryOptions = GALLERY_CATEGORIES.map((c) => ({
    value: c,
    label: c.charAt(0) + c.slice(1).toLowerCase(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Gallery" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Images className="size-6 text-primary" />
          Gallery Manager
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} item{result.total === 1 ? "" : "s"} in the gallery. Published items appear on the public site.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="size-5 text-primary" />
            New gallery item
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GalleryNewForm
            action={saveGalleryItem}
            library={libraryImages}
            categoryOptions={categoryOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-lg">
              Gallery items
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-600">
                {result.total}
              </span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              No gallery items yet. Add one using the form above.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {result.rows.map((item) => (
                <GalleryItemCard
                  key={item.id}
                  item={item}
                  libraryImages={libraryImages}
                  categoryOptions={categoryOptions}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GalleryItemCard({
  item,
  libraryImages,
  categoryOptions,
}: {
  item: {
    id: string;
    mediaId: string;
    media: { id: string; url: string; alt: string } | null;
    title: string | null;
    alt: string;
    category: string;
    sortOrder: number;
    isPublished: boolean;
  };
  libraryImages: { id: string; url: string; alt: string; width: number | null; height: number | null }[];
  categoryOptions: { value: string; label: string }[];
}) {
  const mediaUrl = item.media?.url ?? "";
  const mediaAlt = item.media?.alt ?? item.alt;

  return (
    <details className="group rounded-xl border border-neutral-200 bg-white overflow-hidden open:bg-neutral-50/40">
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          {mediaUrl ? (
            <Image
              src={mediaUrl}
              alt={mediaAlt || ""}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-neutral-400">
              <Images className="size-8" />
            </div>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-neutral-900 line-clamp-1">
              {item.title || <span className="italic text-neutral-500">(no title)</span>}
            </p>
          </div>
          <p className="text-sm text-neutral-600 line-clamp-1">{item.alt}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span
              className={
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                (item.isPublished
                  ? "bg-success/10 text-success"
                  : "bg-neutral-200 text-neutral-600")
              }
            >
              {item.isPublished ? "Published" : "Draft"}
            </span>
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {item.category.charAt(0) + item.category.slice(1).toLowerCase()}
            </span>
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
              Sort: {item.sortOrder}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-end text-neutral-400">
          <Edit3 className="size-4 transition-transform group-open:rotate-45" />
        </div>
      </summary>
      <div className="border-t border-neutral-200 p-4 space-y-3">
        <GalleryEditForm
          item={item}
          action={saveGalleryItem}
          library={libraryImages}
          categoryOptions={categoryOptions}
        />
        <form action={handleDeleteGalleryItem as unknown as (formData: FormData) => void}>
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/5">
            <Trash2 className="size-4" />
            Delete item
          </Button>
        </form>
      </div>
    </details>
  );
}
