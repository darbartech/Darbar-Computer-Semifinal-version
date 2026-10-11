import { GalleryClient } from "./GalleryClient";
import { buildMetadata } from "@/lib/seo";
import { listPublishedGallery } from "@/server/dal/gallery";

export const metadata = buildMetadata({
  title: "Gallery",
  path: "/gallery",
  description:
    "Campus photos, labs, classes, events, and graduation ceremonies at Darbar Computer Training Institute.",
});

export default async function GalleryPage() {
  const galleryItems = await listPublishedGallery();
  const images = galleryItems.map(item => ({
    id: item.id,
    title: item.title ?? "",
    category: String(item.category),
    alt: item.alt ?? item.media?.alt ?? item.title ?? "",
    url: item.media?.url ?? "",
    width: item.media?.width ?? null,
    height: item.media?.height ?? null,
  }));
  const uniqueCategories = Array.from(new Set(images.map(i => i.category)));
  const categories = ["All", ...uniqueCategories];
  return <GalleryClient initialImages={images} categories={categories} />;
}
