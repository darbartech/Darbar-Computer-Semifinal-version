"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  certificateWriteSchema,
  GRADE_OPTIONS,
  REQUIRED_MODULE_COUNT,
  type CertificateWriteInput,
  type CertificateWriteValues,
} from "@/lib/validators/certificates";
import { durationFromWeeks } from "@/lib/duration";
import {
  createCertificateAction,
  updateCertificateAction,
} from "@/server/actions/certificates";
import type { AdminCertificateDetail } from "@/server/types/certificates";
import type { SelectOption } from "@/components/ui/select";

type Props = {
  certificate?: AdminCertificateDetail;
  courseOptions: CertificateCourseOption[];
  templateOptions: SelectOption[];
  canWrite: boolean;
};

/** Course choices that carry enough data to auto-fill the certificate form. */
export type CertificateCourseOption = SelectOption & {
  durationWeeks?: number | null;
  skillsGained?: string[];
  softwareTools?: string[];
  portfolioProjects?: string[];
  learningObjectives?: string[];
};

/** The four fixed module rows, derived from a course's skills and software. */
function courseModuleRows(option: CertificateCourseOption): CertificateWriteInput["items"] {
  return Array.from({ length: REQUIRED_MODULE_COUNT }, (_, i) => {
    const skill = option.skillsGained?.[i] ?? "";
    const tool = option.softwareTools?.[i] ?? "";
    return {
      id: "",
      order: i,
      title: skill || tool || option.learningObjectives?.[i] || option.portfolioProjects?.[i] || "",
      subtitle: tool || option.learningObjectives?.[i] || "",
      shortLabel: "",
    };
  });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-destructive">{message}</p>;
}

function TextField({
  label,
  hint,
  error,
  required,
  inputId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  inputId?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-neutral-800"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

export function CertificateForm({
  certificate,
  courseOptions,
  templateOptions,
  canWrite,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const isFrozen = !!(
    certificate &&
    certificate.status !== "DRAFT" &&
    certificate.status !== "PENDING_ISSUE"
  );
  const disabled = !canWrite || isFrozen;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CertificateWriteInput, unknown, CertificateWriteValues>({
    resolver: zodResolver(certificateWriteSchema),
    defaultValues: {
      id: certificate?.id ?? "",
      recipientName: certificate?.recipientName ?? "",
      courseId: certificate?.courseId ?? "",
      courseName: certificate?.courseName ?? "",
      completionDate: certificate?.completionDate ?? "",
      issueDate: certificate?.issueDate ?? "",
      grade: certificate?.grade ?? "",
      programDuration: certificate?.programDuration ?? "",
      templateId: certificate?.templateId ?? "",
      // The certificate design has exactly four fixed module rows, so the form
      // always seeds four. Existing rows win; the list is padded or trimmed to
      // REQUIRED_MODULE_COUNT so a legacy row with the wrong count still renders.
      items: (() => {
        const existing = certificate?.items?.map((item) => ({
          id: item.id,
          order: item.order,
          title: item.title,
          subtitle: item.subtitle ?? "",
          shortLabel: item.shortLabel ?? "",
        })) ?? [];
        return Array.from({ length: REQUIRED_MODULE_COUNT }, (_, i) => {
          return (
            existing[i] ?? {
              id: "",
              order: i,
              title: "",
              subtitle: "",
              shortLabel: "",
            }
          );
        });
      })(),
    },
  });

  const { fields, replace } = useFieldArray({
    control,
    name: "items",
  });

  const onSubmit = async (values: CertificateWriteValues) => {
    try {
      const result = values.id
        ? await updateCertificateAction(values)
        : await createCertificateAction(values);

      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            setError(field as keyof CertificateWriteInput, {
              type: "server",
              message: messages?.[0] ?? "Invalid value",
            });
          }
        }
        toast({
          title: values.id ? "Could not save" : "Could not create",
          description: result.error,
          variant: "error",
        });
        return;
      }

      toast({
        title: values.id ? "Saved" : "Draft created",
        description: values.id
          ? "Certificate updated."
          : "Now issue it to assign a number and publish the verify page.",
        variant: "success",
      });

      const id = (result.data as { id: string }).id;
      router.replace(`/techdarbar/certificates/${id}`);
      router.refresh();
    } catch (error) {
      console.error(
        "[CertificateForm.submit]",
        error instanceof Error ? error.message : "unknown"
      );
      toast({
        title: "Something went wrong",
        description: "Please try again in a moment.",
        variant: "error",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {isFrozen && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning-foreground">
          <strong className="font-semibold">Certificate locked.</strong> Editing is disabled
          because this certificate is{" "}
          <span className="font-semibold">{certificate?.status}</span>. To fix a mistake,
          use Reissue — issued certificates are immutable permanent records.
        </div>
      )}

      <div className="grid gap-4 rounded-xl border border-neutral-200 bg-white p-4 lg:grid-cols-2">
        <TextField
          label="Course"
          hint="Auto-fills the course name, program duration and module rows from the curriculum."
          error={errors.courseId?.message as string | undefined}
          inputId="cert-form-course"
        >
          <Select
            id="cert-form-course"
            value={watch("courseId") ?? ""}
            onChange={(event) => {
              const courseId = event.target.value;
              setValue("courseId", courseId, { shouldDirty: true });
              const option = courseOptions.find((opt) => opt.value === courseId);
              if (option) {
                setValue("courseName", option.label, { shouldDirty: true });
                const duration = durationFromWeeks(option.durationWeeks);
                if (duration) {
                  setValue("programDuration", duration, { shouldDirty: true });
                }
                // Never overwrite modules the admin already typed: only fill the
                // rows when all four are still blank.
                const currentItems = watch("items") ?? [];
                const untouched = currentItems.every(
                  (item) =>
                    !item?.title?.trim() && !item?.subtitle?.trim() && !item?.shortLabel?.trim()
                );
                if (untouched) {
                  replace(courseModuleRows(option));
                }
              }
            }}
            disabled={disabled}
            options={[
              { value: "", label: "No linked course" },
              ...courseOptions,
            ]}
          />
        </TextField>

        <TextField
          label="Course name"
          required
          error={errors.courseName?.message}
          inputId="cert-form-course-name"
        >
          <Input
            id="cert-form-course-name"
            {...register("courseName")}
            disabled={disabled}
            placeholder="e.g. Diploma in Web Development (Pro)"
          />
        </TextField>

        <TextField
          label="Recipient full name"
          required
          error={errors.recipientName?.message}
          inputId="cert-form-recipient-name"
        >
          <Input
            id="cert-form-recipient-name"
            {...register("recipientName")}
            disabled={disabled}
            placeholder="e.g. Raju Kumar Shrestha"
          />
        </TextField>

        <TextField
          label="Recipient ID"
          hint="Auto-generated (DT-STD-{year}-{NNNNN}). Always hidden from the public verify page."
        >
          <div
            aria-hidden="true"
            className="flex h-11 min-h-11 items-center rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3.5 text-sm text-neutral-500"
          >
            {certificate?.recipientIdNumber
              ? certificate.recipientIdNumber
              : "Assigned automatically when you save this draft"}
          </div>
        </TextField>

        <TextField
          label="Completion date"
          hint="When the student finished the course."
          error={errors.completionDate?.message as string | undefined}
          inputId="cert-form-completion-date"
        >
          <Input
            id="cert-form-completion-date"
            type="date"
            {...register("completionDate")}
            disabled={disabled}
          />
        </TextField>

        <TextField
          label="Issue date"
          hint="Shown on the certificate. Defaults to today on issue."
          error={errors.issueDate?.message as string | undefined}
          inputId="cert-form-issue-date"
        >
          <Input
            id="cert-form-issue-date"
            type="date"
            {...register("issueDate")}
            disabled={disabled}
          />
        </TextField>

        <TextField
          label="Program duration"
          hint={`Printed in the duration sentence, e.g. "4 Months". Falls back to the course duration when blank.`}
          error={errors.programDuration?.message as string | undefined}
          inputId="cert-form-program-duration"
        >
          <Input
            id="cert-form-program-duration"
            {...register("programDuration")}
            disabled={disabled}
          />
        </TextField>

        <TextField
          label="Grade (optional)"
          hint="Printed in the grade badge. Leave blank to omit the badge entirely."
          error={errors.grade?.message as string | undefined}
          inputId="cert-form-grade"
        >
          <Select
            id="cert-form-grade"
            value={watch("grade") ?? ""}
            onChange={(event) => setValue("grade", event.target.value, { shouldDirty: true })}
            disabled={disabled}
            options={[
              { value: "", label: "No grade (omit badge)" },
              ...GRADE_OPTIONS,
            ]}
          />
        </TextField>

        <TextField
          label="Template"
          error={errors.templateId?.message as string | undefined}
          inputId="cert-form-template"
        >
          <Select
            id="cert-form-template"
            value={watch("templateId") ?? ""}
            onChange={(event) => setValue("templateId", event.target.value, { shouldDirty: true })}
            disabled={disabled}
            options={[
              { value: "", label: "Default template" },
              ...templateOptions,
            ]}
          />
        </TextField>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900">Modules / Items</h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              The certificate design has exactly {REQUIRED_MODULE_COUNT} fixed module
              rows. All four are printed, so each needs a title.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-3 sm:grid-cols-12"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 sm:col-span-12">
                Module {index + 1} of {REQUIRED_MODULE_COUNT}
              </p>
              <div className="sm:col-span-5">
                <Label
                  className="mb-1 block text-xs font-semibold text-neutral-600"
                  htmlFor={`item-${index}-title`}
                >
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id={`item-${index}-title`}
                  {...register(`items.${index}.title` as const)}
                  disabled={disabled}
                />
                <FieldError
                  message={
                    (errors.items?.[index] as { title?: { message?: string } } | undefined)
                      ?.title?.message
                  }
                />
              </div>
              <div className="sm:col-span-4">
                <Label
                  className="mb-1 block text-xs font-semibold text-neutral-600"
                  htmlFor={`item-${index}-subtitle`}
                >
                  Subtitle
                </Label>
                <Input
                  id={`item-${index}-subtitle`}
                  {...register(`items.${index}.subtitle` as const)}
                  disabled={disabled}
                />
              </div>
              <div className="sm:col-span-2">
                <Label
                  className="mb-1 block text-xs font-semibold text-neutral-600"
                  htmlFor={`item-${index}-short`}
                >
                  Short label
                </Label>
                <Input
                  id={`item-${index}-short`}
                  {...register(`items.${index}.shortLabel` as const)}
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-col-reverse items-stretch gap-3 rounded-xl border border-neutral-200 bg-white/95 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-neutral-500">
          {certificate
            ? "Saving writes changes to this draft. Issuing locks it permanently."
            : "This creates a DRAFT only. Nothing is issued — you can continue editing."}
        </p>
        <div>
          <Button type="submit" disabled={disabled || isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="size-4" />
                {certificate ? "Save changes" : "Save draft"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
