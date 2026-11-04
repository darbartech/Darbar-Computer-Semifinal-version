"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ImagePicker, type LibraryImage, type PickedImage } from "@/components/admin/ImagePicker";
import { saveCourse } from "@/server/actions/courses";
import {
  COURSE_STATUS_OPTIONS,
  LEARNING_MODE_OPTIONS,
  LEVEL_OPTIONS,
  TIME_SLOT_OPTIONS,
  courseWriteSchema,
  type CourseWriteInput,
  type CourseWriteValues,
} from "@/lib/validators/course";
import type { AdminCourseDetail } from "@/server/dal/courses";
import { cn } from "@/lib/utils";

/**
 * Course editor (docs/05 §4.4): one form, six tabs, one save button.
 *
 * The tabs only organise fields — they all submit together, so a half-finished
 * Basics tab can never silently drop the Portfolio tab. The form is validated by
 * `courseWriteSchema` here and again inside `saveCourse`, because a Server
 * Action is a public endpoint.
 */
type Props = {
  /** `undefined` on `/techdarbar/courses/new`. */
  course?: AdminCourseDetail;
  categories: { id: string; label: string }[];
  library: LibraryImage[];
  canWrite: boolean;
};

const TABS = [
  { value: "basics", label: "Basics" },
  { value: "details", label: "Details" },
  { value: "skills", label: "Skills & Tools" },
  { value: "portfolio", label: "Portfolio & Career" },
  { value: "batches", label: "Batches & Fees" },
  { value: "seo", label: "SEO" },
] as const;

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

/** Comma-separated lists map to textareas so editors keep one field per block. */
function ListField({
  label,
  hint,
  error,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium text-neutral-800">{label}</Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && !error && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

function CheckboxGroup<T extends string>({
  legend,
  options,
  values,
  onToggle,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  values: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-neutral-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={checked}
              className={cn(
                "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                checked
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CourseForm({ course, categories, library, canWrite }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<string>("basics");
  const [cover, setCover] = React.useState<PickedImage>(
    course?.cover ? { id: course.cover.id, url: course.cover.url, alt: course.cover.alt } : null
  );
  /** Auto-slug until the editor types one, so renaming the title keeps working. */
  const slugTouched = React.useRef(!!course?.slug);

  /**
   * The schema coerces and transforms (comma lists → arrays, numbers from
   * `FormData`), so the form is typed as input → output: react-hook-form keeps
   * the raw strings and hands `onSubmit` the parsed values.
   */
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CourseWriteInput, unknown, CourseWriteValues>({
    resolver: zodResolver(courseWriteSchema),
    defaultValues: {
      id: course?.id ?? "",
      title: course?.title ?? "",
      slug: course?.slug ?? "",
      tagline: course?.tagline ?? "",
      shortDescription: course?.shortDescription ?? "",
      overview: course?.overview ?? "",
      categoryId: course?.categoryId ?? categories[0]?.id ?? "",
      level: (course?.level as CourseWriteInput["level"]) ?? "BEGINNER",
      durationWeeks: course?.durationWeeks ?? 4,
      learningModes: (course?.learningModes as CourseWriteInput["learningModes"]) ?? ["PHYSICAL"],
      timeSlots: (course?.timeSlots as CourseWriteInput["timeSlots"]) ?? ["DAY"],
      batchFrequency: course?.batchFrequency ?? "",
      targetStudents: course?.targetStudents ?? "",
      prerequisites: course?.prerequisites ?? "",
      instituteCertificate: course?.instituteCertificate ?? "",
      industryCertifications: (course?.industryCertifications ?? []).join(", "),
      internship: course?.internship ?? "",
      seatsNote: course?.seatsNote ?? "",
      feeNPR: course?.feeNPR ?? 0,
      feeNote: course?.feeNote ?? "",
      skillsGained: (course?.skillsGained ?? []).join(", "),
      softwareTools: (course?.softwareTools ?? []).join(", "),
      portfolioProjects: (course?.portfolioProjects ?? []).join(", "),
      careerOpportunities: (course?.careerOpportunities ?? []).join(", "),
      learningObjectives: (course?.learningObjectives ?? []).join(", "),
      ctaText: course?.ctaText ?? "",
      seoTitle: course?.seoTitle ?? "",
      seoDescription: course?.seoDescription ?? "",
      coverId: course?.coverId ?? "",
      status: (course?.status as CourseWriteInput["status"]) ?? "DRAFT",
      isFeatured: course?.isFeatured ?? false,
      featuredOrder: course?.featuredOrder ?? undefined,
      sortOrder: course?.sortOrder ?? 0,
    },
  });

  const isFeatured = watch("isFeatured");
  const status = watch("status");
  const learningModes = watch("learningModes") ?? [];
  const timeSlots = watch("timeSlots") ?? [];

  const listValue = (field: keyof CourseWriteInput) => String(getValues(field) ?? "");

  const toggleEnum = (
    field: "learningModes" | "timeSlots",
    option: string
  ) => {
    const current = (getValues(field) as string[] | undefined) ?? [];
    const next = current.includes(option)
      ? current.filter((entry) => entry !== option)
      : [...current, option];
    setValue(field, next as never, { shouldDirty: true, shouldValidate: true });
  };

  const onSubmit = async (values: CourseWriteValues) => {
    const result = await saveCourse({
      ...values,
      coverId: cover?.id ?? values.coverId ?? "",
    });
    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          setError(field as keyof CourseWriteInput, { message: messages[0] });
        }
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({
      title: course ? "Course updated" : "Course created",
      description:
        result.data.status === "PUBLISHED"
          ? "The catalog now shows your changes."
          : "Saved as a draft — publish it to make it public.",
      variant: "success",
    });

    if (!course) {
      router.push(`/techdarbar/courses/${result.data.id}`);
    } else {
      router.refresh();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          {course ? (
            <>
              <span className="font-medium text-neutral-900">Editing</span>
              <span className="truncate">{course.title}</span>
              <span className="text-xs text-neutral-500">
                · updated {new Date(course.updatedAt).toLocaleDateString("en-NP")}
              </span>
            </>
          ) : (
            <span>New course — it starts as a draft unless you publish it now.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {course && (
            <Link
              href={`/courses/${course.slug}`}
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
            {course ? "Save changes" : "Create course"}
          </Button>
        </div>
      </div>

      {!canWrite && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-neutral-700">
          You can view this form but not save changes — your role does not have the
          course write permission.
        </p>
      )}

      <Tabs defaultValue="basics" value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList className="flex w-max min-w-full gap-1">
            {TABS.map((item) => (
              <TabsTrigger key={item.value} value={item.value} className="whitespace-nowrap">
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6">
          <TabsContent value="basics" className="flex flex-col gap-5">
            <ImagePicker
              label="Cover image"
              value={cover}
              onChange={(next) => {
                setCover(next);
                setValue("coverId", next?.id ?? "", { shouldDirty: true });
              }}
              library={library}
              hint="Shown on the course card, the course page and the homepage. Recommended 1600 x 900. Alt text is required."
              disabled={!canWrite}
            />

            <TextField label="Course title" error={errors.title?.message}>
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
                label="Public URL"
                hint="Changing this breaks existing links to the course."
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

              <TextField label="Category" error={errors.categoryId?.message}>
                <Select
                  {...register("categoryId")}
                  disabled={!canWrite}
                  options={categories.map((category) => ({
                    value: category.id,
                    label: category.label,
                  }))}
                />
              </TextField>

              <TextField label="Level" error={errors.level?.message}>
                <Select
                  {...register("level")}
                  disabled={!canWrite}
                  options={LEVEL_OPTIONS}
                />
              </TextField>

              <TextField label="Status" error={errors.status?.message}>
                <Select
                  {...register("status")}
                  disabled={!canWrite}
                  options={COURSE_STATUS_OPTIONS.map((option) => ({ ...option }))}
                />
              </TextField>

              <TextField
                label="Catalog order"
                hint="Lower numbers appear first in /courses."
                error={errors.sortOrder?.message}
              >
                <Input type="number" min={0} {...register("sortOrder")} disabled={!canWrite} />
              </TextField>

              {isFeatured && (
                <TextField
                  label="Featured position"
                  hint="Blank means next free slot. Featured courses can show on the home page and in the footer."
                  error={errors.featuredOrder?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    {...register("featuredOrder")}
                    disabled={!canWrite}
                    placeholder="auto"
                  />
                </TextField>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                {...register("isFeatured")}
                disabled={!canWrite}
              />
              <span className="text-sm">
                <span className="font-medium text-neutral-900">Show in featured spots</span>
                <span className="block text-neutral-600">
                  Home page, footer and the featured filter. Draft and archived courses
                  never show there.
                </span>
              </span>
            </label>

            <TextField label="Tagline" hint="One line shown under the title and on cards." error={errors.tagline?.message}>
              <Input {...register("tagline")} disabled={!canWrite} />
            </TextField>

            <TextField
              label="Short description"
              hint="Used on cards, in search results and as the SEO fallback."
              error={errors.shortDescription?.message}
            >
              <Textarea rows={3} {...register("shortDescription")} disabled={!canWrite} />
            </TextField>
          </TabsContent>

          <TabsContent value="details" className="flex flex-col gap-5">
            <TextField label="Overview" hint="Long description shown in the Overview tab." error={errors.overview?.message}>
              <Textarea rows={10} {...register("overview")} disabled={!canWrite} />
            </TextField>

            <TextField
              label="Who this course is for"
              hint="Comma-separated: students, job-seekers, business owners."
              error={errors.targetStudents?.message}
            >
              <Textarea rows={3} {...register("targetStudents")} disabled={!canWrite} />
            </TextField>

            <TextField label="Prerequisites" error={errors.prerequisites?.message}>
              <Textarea rows={3} {...register("prerequisites")} disabled={!canWrite} />
            </TextField>

            <TextField label="Institute certificate" error={errors.instituteCertificate?.message}>
              <Input {...register("instituteCertificate")} disabled={!canWrite} />
            </TextField>

            <ListField
              label="Industry certifications"
              hint="Comma-separated, e.g. Microsoft, Google, Meta."
              error={errors.industryCertifications?.message}
              value={listValue("industryCertifications")}
              onChange={(value) => setValue("industryCertifications", value)}
            />

            <TextField label="Internship or placement support" error={errors.internship?.message}>
              <Textarea rows={3} {...register("internship")} disabled={!canWrite} />
            </TextField>

            <ListField
              label="Learning objectives"
              hint="Comma-separated outcomes students can expect."
              error={errors.learningObjectives?.message}
              value={listValue("learningObjectives")}
              onChange={(value) => setValue("learningObjectives", value)}
              rows={5}
            />
          </TabsContent>

          <TabsContent value="skills" className="flex flex-col gap-5">
            <ListField
              label="Skills gained"
              hint="Comma-separated. The first six appear on the course page."
              error={errors.skillsGained?.message}
              value={listValue("skillsGained")}
              onChange={(value) => setValue("skillsGained", value)}
              rows={6}
            />
            <ListField
              label="Software and tools"
              hint="Comma-separated tool names, e.g. Figma, Excel."
              error={errors.softwareTools?.message}
              value={listValue("softwareTools")}
              onChange={(value) => setValue("softwareTools", value)}
              rows={5}
            />
          </TabsContent>

          <TabsContent value="portfolio" className="flex flex-col gap-5">
            <ListField
              label="Portfolio projects"
              hint="Comma-separated projects students finish."
              error={errors.portfolioProjects?.message}
              value={listValue("portfolioProjects")}
              onChange={(value) => setValue("portfolioProjects", value)}
              rows={6}
            />
            <ListField
              label="Career opportunities"
              hint="Comma-separated roles graduates can target."
              error={errors.careerOpportunities?.message}
              value={listValue("careerOpportunities")}
              onChange={(value) => setValue("careerOpportunities", value)}
              rows={6}
            />
          </TabsContent>

          <TabsContent value="batches" className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField label="Duration (weeks)" error={errors.durationWeeks?.message}>
                <Input type="number" min={1} {...register("durationWeeks")} disabled={!canWrite} />
              </TextField>

              <TextField label="Fee (NPR)" hint="Whole rupees. Installment plans are explained on the page." error={errors.feeNPR?.message}>
                <Input type="number" min={0} step={100} {...register("feeNPR")} disabled={!canWrite} />
              </TextField>

              <TextField label="Batch frequency" error={errors.batchFrequency?.message}>
                <Input
                  {...register("batchFrequency")}
                  disabled={!canWrite}
                  placeholder="Every 4 weeks"
                />
              </TextField>

              <TextField label="Fee note" error={errors.feeNote?.message}>
                <Input {...register("feeNote")} disabled={!canWrite} />
              </TextField>
            </div>

            <CheckboxGroup
              legend="Learning modes"
              options={LEARNING_MODE_OPTIONS}
              values={learningModes}
              onToggle={(value) => toggleEnum("learningModes", value)}
            />
            <CheckboxGroup
              legend="Class timings"
              options={TIME_SLOT_OPTIONS}
              values={timeSlots}
              onToggle={(value) => toggleEnum("timeSlots", value)}
            />

            <TextField label="Seats note" error={errors.seatsNote?.message}>
              <Input {...register("seatsNote")} disabled={!canWrite} />
            </TextField>

            <TextField
              label="Call-to-action text"
              hint="Shown on the enrollment button."
              error={errors.ctaText?.message}
            >
              <Input {...register("ctaText")} disabled={!canWrite} />
            </TextField>
          </TabsContent>

          <TabsContent value="seo" className="flex flex-col gap-5">
            <TextField
              label="SEO title"
              hint="Max 60 characters. Falls back to the course title."
              error={errors.seoTitle?.message}
            >
              <Input {...register("seoTitle")} disabled={!canWrite} />
            </TextField>

            <TextField
              label="SEO description"
              hint="Max 160 characters. Falls back to the short description."
              error={errors.seoDescription?.message}
            >
              <Textarea rows={3} {...register("seoDescription")} disabled={!canWrite} />
            </TextField>

            <p className="rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
              {status === "PUBLISHED"
                ? "This course is live: changes appear on the public catalog as soon as you save."
                : "This course is not public. It appears on /courses only after you set the status to Published."}
            </p>
          </TabsContent>
        </div>
      </Tabs>
    </form>
  );
}
