"use client";
import * as React from "react";
import { Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, type SelectOption } from "@/components/ui/select";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";

type GalleryAction = (input: unknown) => Promise<{ ok: boolean; error?: string }>;

export function GalleryNewForm({
  action,
  library,
  categoryOptions,
}: {
  action: GalleryAction;
  library: LibraryImage[];
  categoryOptions: SelectOption[];
}) {
  const [image, setImage] = React.useState<PickedImage>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!image) {
      form.reportValidity();
      return;
    }

    const payload = {
      mediaId: image.id,
      title: String(formData.get("title") ?? ""),
      alt: String(formData.get("alt") ?? ""),
      category: String(formData.get("category") ?? ""),
      sortOrder: formData.get("sortOrder"),
      isPublished: formData.get("isPublished") === "on",
    };

    await action(payload);
    form.reset();
    setImage(null);
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ImagePicker
            label="Image"
            value={image}
            onChange={setImage}
            library={library}
            hint="Upload a new image or choose one from the library."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gal-new-title">Title</Label>
          <Input id="gal-new-title" name="title" placeholder="Summer campus tour 2025" maxLength={160} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gal-new-alt">
            Alt text <span className="text-destructive">*</span>
          </Label>
          <Input id="gal-new-alt" name="alt" placeholder="Describe the image for accessibility" maxLength={200} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gal-new-category">Category</Label>
          <Select
            id="gal-new-category"
            name="category"
            placeholder="Select a category"
            defaultValue={GALLERY_CATEGORIES_FALLBACK[0]}
            options={categoryOptions}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gal-new-sort">Sort order</Label>
          <Input id="gal-new-sort" name="sortOrder" type="number" min={0} max={9999} defaultValue={0} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            id="gal-new-published"
            name="isPublished"
            defaultChecked
            className="size-4 rounded border-neutral-300 text-primary focus:ring-primary"
          />
          <Label htmlFor="gal-new-published" className="!mb-0">Published</Label>
        </div>
      </div>
      <Button type="submit">
        <Plus className="size-4" />
        Add gallery item
      </Button>
    </form>
  );
}

const GALLERY_CATEGORIES_FALLBACK = ["CAMPUS", "LABS", "EVENTS", "CLASSES", "CERTIFICATIONS"];

export function GalleryEditForm({
  item,
  action,
  library,
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
  action: GalleryAction;
  library: LibraryImage[];
  categoryOptions: SelectOption[];
}) {
  const [image, setImage] = React.useState<PickedImage>(
    item.media ? { id: item.media.id, url: item.media.url, alt: item.media.alt } : null
  );
  const formRef = React.useRef<HTMLFormElement>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    if (!image) {
      form.reportValidity();
      return;
    }

    const payload = {
      id: item.id,
      mediaId: image.id,
      title: String(formData.get("title") ?? ""),
      alt: String(formData.get("alt") ?? ""),
      category: String(formData.get("category") ?? ""),
      sortOrder: formData.get("sortOrder"),
      isPublished: formData.get("isPublished") === "on",
    };

    await action(payload);
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ImagePicker
            label="Image"
            value={image}
            onChange={setImage}
            library={library}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input name="title" defaultValue={item.title ?? undefined} placeholder="Optional title" maxLength={160} />
        </div>
        <div className="space-y-1.5">
          <Label>
            Alt text <span className="text-destructive">*</span>
          </Label>
          <Input name="alt" defaultValue={item.alt} maxLength={200} required />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select
            name="category"
            defaultValue={item.category}
            options={categoryOptions}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>Sort order</Label>
          <Input name="sortOrder" type="number" min={0} max={9999} defaultValue={item.sortOrder} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            id={`gal-edit-pub-${item.id}`}
            name="isPublished"
            defaultChecked={item.isPublished}
            className="size-4 rounded border-neutral-300 text-primary focus:ring-primary"
          />
          <Label htmlFor={`gal-edit-pub-${item.id}`} className="!mb-0">Published</Label>
        </div>
      </div>
      <Button type="submit" size="sm">
        <Save className="size-4" />
        Save changes
      </Button>
    </form>
  );
}
