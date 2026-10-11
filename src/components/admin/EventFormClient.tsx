"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Loader2, Save, ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveEvent } from "@/server/actions/events";
import {
  EVENT_STATUSES,
  EVENT_CATEGORIES,
  eventWriteSchema,
  type EventWriteInput,
  type EventWriteValues,
} from "@/lib/validators/events";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

const CATEGORY_LABEL: Record<string, string> = {
  WORKSHOP: "Workshop",
  SEMINAR: "Seminar",
  OPEN_HOUSE: "Open House",
  CERTIFICATION: "Certification",
  OTHER: "Other",
};

const STATUS_OPTIONS = EVENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const CATEGORY_OPTIONS = EVENT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function toLocalInput(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

type EventFormEvent = {
  id?: string;
  title?: string;
  slug?: string;
  category?: string;
  startsAt?: string | Date;
  endsAt?: string | Date | null;
  location?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  coverId?: string | null;
  cover?: { id: string; url: string; alt: string } | null;
  registrationUrl?: string | null;
  capacity?: number | null;
  status?: string;
  updatedAt?: string | Date;
};

export function EventFormClient({
  event,
  library,
  canWrite,
}: {
  event?: EventFormEvent;
  library: LibraryImage[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [cover, setCover] = React.useState<PickedImage>(
    event?.cover ? { id: event.cover.id, url: event.cover.url, alt: event.cover.alt } : null
  );
  const slugTouched = React.useRef(!!event?.slug);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EventWriteInput, unknown, EventWriteValues>({
    resolver: zodResolver(eventWriteSchema),
    defaultValues: {
      id: event?.id ?? "",
      title: event?.title ?? "",
      slug: event?.slug ?? "",
      category: (event?.category as EventWriteInput["category"]) ?? "WORKSHOP",
      startsAt: event?.startsAt ? toLocalInput(event.startsAt) : "",
      endsAt: event?.endsAt ? toLocalInput(event.endsAt) : "",
      location: event?.location ?? "",
      shortDescription: event?.shortDescription ?? "",
      fullDescription: event?.fullDescription ?? "",
      coverId: event?.coverId ?? "",
      registrationUrl: event?.registrationUrl ?? "",
      capacity: event?.capacity ?? null,
      status: (event?.status as EventWriteInput["status"]) ?? "DRAFT",
    },
  });

  const status = watch("status");

  const onSubmit = async (values: EventWriteValues) => {
    const result = await saveEvent({
      ...values,
      coverId: cover?.id ?? values.coverId ?? "",
    });
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          setError(field as keyof EventWriteInput, { message: messages[0] });
        }
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({
      title: event ? "Event updated" : "Event created",
      description:
        result.data.status === "PUBLISHED"
          ? "It is now live on /events."
          : "Saved as a draft — publish it to make it public.",
      variant: "success",
    });

    if (!event) {
      router.push(`/admin/events/${result.data.id}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          {event ? (
            <>
              <span className="font-medium text-neutral-900">Editing</span>
              <span className="truncate">{event.title}</span>
              {event.updatedAt && (
                <span className="text-xs text-neutral-500">
                  · updated {new Date(event.updatedAt).toLocaleDateString("en-NP")}
                </span>
              )}
            </>
          ) : (
            <span>New event — it starts as a draft unless you publish it now.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {event && event.slug && (
            <Link
              href={`/events/${event.slug}`}
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
            {event ? "Save changes" : "Create event"}
          </Button>
        </div>
      </div>

      {!canWrite && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-neutral-700">
          You can view this form but not save changes — your role does not have the
          events write permission.
        </p>
      )}

      <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 flex flex-col gap-5">
        <TextField label="Title" error={errors.title?.message}>
          <Input
            {...register("title")}
            disabled={!canWrite}
            onChange={(e) => {
              if (!slugTouched.current) {
                setValue("slug", slugify(e.target.value), { shouldValidate: false });
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
              onChange={(e) => {
                slugTouched.current = true;
                setValue("slug", slugify(e.target.value));
              }}
            />
          </TextField>

          <TextField label="Category" error={errors.category?.message}>
            <Select
              {...register("category")}
              disabled={!canWrite}
              options={CATEGORY_OPTIONS}
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
            label="Capacity"
            hint="Maximum attendees. Leave blank for unlimited."
            error={errors.capacity?.message}
          >
            <Input
              type="number"
              min={0}
              max={10000}
              {...register("capacity")}
              disabled={!canWrite}
              placeholder="Optional"
            />
          </TextField>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField label="Starts at" error={errors.startsAt?.message}>
            <Input
              type="datetime-local"
              {...register("startsAt")}
              disabled={!canWrite}
            />
          </TextField>

          <TextField
            label="Ends at"
            hint="Optional. Must be after the start time."
            error={errors.endsAt?.message}
          >
            <Input
              type="datetime-local"
              {...register("endsAt")}
              disabled={!canWrite}
            />
          </TextField>
        </div>

        <TextField
          label="Location"
          hint="Venue or physical address."
          error={errors.location?.message}
        >
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              {...register("location")}
              disabled={!canWrite}
              className="pl-10"
              placeholder="DarbarTech Computer Institute, Kathmandu"
            />
          </div>
        </TextField>

        <TextField
          label="Short description"
          hint="Used on cards, in search results and as SEO fallback (max 400 chars)."
          error={errors.shortDescription?.message}
        >
          <Textarea rows={3} {...register("shortDescription")} disabled={!canWrite} />
        </TextField>

        <TextField
          label="Full description"
          hint="Long description shown on the event page."
          error={errors.fullDescription?.message}
        >
          <Textarea rows={12} {...register("fullDescription")} disabled={!canWrite} />
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
          label="Registration URL"
          hint="External form or booking link."
          error={errors.registrationUrl?.message}
        >
          <Input
            {...register("registrationUrl")}
            disabled={!canWrite}
            placeholder="https://forms.google.com/..."
          />
        </TextField>

        <p className="rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
          {status === "PUBLISHED"
            ? "This event is live: changes appear on the public events page as soon as you save."
            : status === "CANCELLED"
            ? "This event is marked as cancelled — attendees will see a cancellation notice."
            : "This event is not public. It appears on /events only after you set the status to Published."}
        </p>
      </div>
    </form>
  );
}

export { ArrowLeft };
