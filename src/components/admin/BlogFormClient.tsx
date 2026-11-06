"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Save, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveBlogPost } from "@/server/actions/blog";
import {
  PUBLISH_STATUSES,
  blogWriteSchema,
  type BlogWriteInput,
  type BlogWriteValues,
} from "@/lib/validators/blog";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_OPTIONS = PUBLISH_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{message}</p>;
}

function TextField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-neutral-800">{label}</Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

type BlogFormPost = {
  id?: string;
  title?: string | null;
  slug?: string | null;
  excerpt?: string | null;
  contentMd?: string | null;
  coverId?: string | null;
  cover?: { id: string; url: string; alt: string } | null;
  authorName?: string | null;
  readingMinutes?: number | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  status?: string | null;
  publishedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  tags?: Array<{ name: string } | string>;
};

export function BlogFormClient({
  post,
  library,
  canWrite,
}: {
  post?: BlogFormPost;
  library: LibraryImage[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [cover, setCover] = React.useState<PickedImage>(
    post?.cover ? { id: post.cover.id, url: post.cover.url, alt: post.cover.alt } : null
  );
  const slugTouched = React.useRef(!!post?.slug);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<BlogWriteInput, unknown, BlogWriteValues>({
    resolver: zodResolver(blogWriteSchema),
    defaultValues: {
      id: post?.id ?? "",
      title: post?.title ?? "",
      slug: post?.slug ?? "",
      excerpt: post?.excerpt ?? "",
      contentMd: post?.contentMd ?? "",
      coverId: post?.coverId ?? "",
      authorName: post?.authorName ?? "",
      readingMinutes: post?.readingMinutes ?? 5,
      seoTitle: post?.seoTitle ?? "",
      seoDescription: post?.seoDescription ?? "",
      status: (post?.status as BlogWriteInput["status"]) ?? "DRAFT",
      publishedAt: post?.publishedAt ?? "",
      tags: (post?.tags ?? []).map((t: { name?: string } | string) =>
        typeof t === "string" ? t : t.name ?? ""
      ).join(", "),
    },
  });

  const status = watch("status");

  const onSubmit = async (values: BlogWriteValues) => {
    const result = await saveBlogPost({
      ...values,
      coverId: cover?.id ?? values.coverId ?? "",
    });
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          setError(field as keyof BlogWriteInput, { message: messages[0] });
        }
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({
      title: post ? "Post updated" : "Post created",
      description:
        result.data.status === "PUBLISHED"
          ? "It is now live on /blog."
          : "Saved as a draft — publish it to make it public.",
      variant: "success",
    });

    if (!post) {
      router.push(`/techdarbar/blog/${result.data.id}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          {post ? (
            <>
              <span className="font-medium text-neutral-900">Editing</span>
              <span className="truncate">{post.title}</span>
              {post.updatedAt && (
                <span className="text-xs text-neutral-500">
                  · updated {fmtDate(post.updatedAt)}
                </span>
              )}
            </>
          ) : (
            <span>New post — it starts as a draft unless you publish it now.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {post && post.slug && (
            <Link
              href={`/blog/${post.slug}`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100",
                !canWrite && "pointer-events-none opacity-50"
              )}
            >
              <ExternalLink className="size-4" />
              View public page
            </Link>
          )}
          <Button type="submit" disabled={!canWrite || isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {post ? "Save changes" : "Create post"}
          </Button>
        </div>
      </div>

      {!canWrite && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-neutral-700">
          You can view this form but not save changes — your role does not have the
          blog write permission.
        </p>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 flex flex-col gap-5">
        <TextField label="Title" error={errors.title?.message}>
          <Input
            {...register("title")}
            disabled={!canWrite}
            onChange={(event) => {
              if (!slugTouched.current) {
                setValue("slug", slugify(event.target.value), { shouldValidate: false });
              }
            }}
          />
        </TextField>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Public URL (slug)"
            hint="Use lowercase letters, numbers and single hyphens."
            error={errors.slug?.message}
          >
            <Input
              {...register("slug")}
              disabled={!canWrite}
              onChange={(event) => {
                slugTouched.current = true;
                setValue("slug", slugify(event.target.value));
              }}
            />
          </TextField>

          <TextField label="Status" error={errors.status?.message}>
            <Select
              {...register("status")}
              disabled={!canWrite}
              options={STATUS_OPTIONS}
            />
          </TextField>

          <TextField
            label="Author name"
            hint="Override the logged-in author display name."
            error={errors.authorName?.message}
          >
            <Input {...register("authorName")} disabled={!canWrite} placeholder="Optional" />
          </TextField>

          <TextField
            label="Reading time (minutes)"
            error={errors.readingMinutes?.message}
          >
            <Input
              type="number"
              min={1}
              max={120}
              {...register("readingMinutes")}
              disabled={!canWrite}
            />
          </TextField>
        </div>

        <TextField
          label="Excerpt"
          hint="Short summary shown on cards, listing pages, and SEO description fallback."
          error={errors.excerpt?.message}
        >
          <Textarea rows={3} {...register("excerpt")} disabled={!canWrite} />
        </TextField>

        <TextField
          label="Content (Markdown)"
          hint="Full post body written in Markdown."
          error={errors.contentMd?.message}
        >
          <Textarea rows={16} {...register("contentMd")} disabled={!canWrite} />
        </TextField>

        <ImagePicker
          label="Cover image"
          value={cover}
          onChange={(next) => {
            setCover(next);
            setValue("coverId", next?.id ?? "", { shouldDirty: true });
          }}
          library={library}
          hint="Recommended 1600 x 900. Alt text is required."
          disabled={!canWrite}
        />

        <TextField
          label="Tags"
          hint="Comma-separated, e.g. admissions, workshop, computer-basics."
          error={errors.tags?.message}
        >
          <Input {...register("tags")} disabled={!canWrite} placeholder="Optional" />
        </TextField>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="SEO title"
            hint="Max 60 characters. Falls back to the post title."
            error={errors.seoTitle?.message}
          >
            <Input {...register("seoTitle")} disabled={!canWrite} placeholder="Optional" />
          </TextField>

          <TextField
            label="SEO description"
            hint="Max 160 characters. Falls back to the excerpt."
            error={errors.seoDescription?.message}
          >
            <Textarea rows={3} {...register("seoDescription")} disabled={!canWrite} />
          </TextField>
        </div>

        <p className="rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          {status === "PUBLISHED"
            ? "This post is live: changes appear on the public blog as soon as you save."
            : status === "ARCHIVED"
            ? "This post is archived — its public page returns 404."
            : "This post is not public. It appears on /blog only after you set the status to Published."}
        </p>
      </div>
    </form>
  );
}

export { ArrowLeft };
