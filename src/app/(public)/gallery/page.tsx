import { GalleryClient } from "./GalleryClient";
import { buildMetadata } from "@/lib/seo";
import { listPublishedGallery } from "@/server/dal/gallery";
import { getSiteSettings } from "@/server/dal/settings";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Gallery",
      path: "/gallery",
      description:
        "Campus photos, labs, classes, events, and graduation ceremonies at Darbar Computer Training Institute.",
    },
    await getSiteSettings()
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  CAMPUS: "Campus",
  LABS: "Labs",
  EVENTS: "Events",
  CLASSES: "Classes",
  CERTIFICATIONS: "Certifications",
};

export default async function GalleryPage() {
  const galleryItems = await listPublishedGallery();
  const images = galleryItems.map((item) => {
    const rawCategory = String(item.category);
    return {
      id: item.id,
      title: item.title ?? "",
      category: CATEGORY_LABELS[rawCategory] ?? rawCategory,
      alt: item.alt ?? item.media?.alt ?? item.title ?? "",
      url: item.media?.url ?? "",
      width: item.media?.width ?? null,
      height: item.media?.height ?? null,
    };
  });
  const uniqueCategories = Array.from(new Set(images.map(i => i.category)));
  const categories = ["All", ...uniqueCategories];
  return <GalleryClient initialImages={images} categories={categories} />;
}
