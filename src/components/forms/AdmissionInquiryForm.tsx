"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, CheckCircle2, Loader2, Phone, Mail, UserRound, BookOpenCheck, MessageSquare, Clock, ShieldCheck } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/common/Badge";
import { Card, CardContent } from "@/components/ui/card";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { submitInquiry } from "@/server/actions/public-forms";
import { inquiryFormSchema, type InquiryFormInput } from "@/lib/validators/lead";
import { PREFERRED_BATCH_OPTIONS } from "@/lib/validators/shared";
import { cn } from "@/lib/utils";

const batchOptions = PREFERRED_BATCH_OPTIONS.map((o) => ({ ...o }));

export type InquiryCourseOption = {
  slug: string;
  title: string;
  category: string;
  level: string;
};

export type AdmissionInquiryFormProps = {
  /**
   * Course options come from the parent server component (docs/04 §2.1, P2).
   * Phase 3 swaps the parent's source from `src/content/courses` to the DAL.
   */
  courses?: InquiryCourseOption[];
  /** Live site name from settings, passed by the parent server component. */
  siteName?: string;
  /**
   * URL-derived defaults, parsed by the server page. Reading `useSearchParams`
   * here would opt this form out of server rendering.
   */
  initialValues?: {
    course?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
  };
};

export function AdmissionInquiryForm({
  courses = [],
  siteName = "this institute",
  initialValues,
}: AdmissionInquiryFormProps) {
  const prefilledCourse = initialValues?.course ?? "";
  const { toast } = useToast();
  const [submitted, setSubmitted] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState("");

  const courseOptions = React.useMemo(
    () => [
      { value: "", label: "Not sure yet — need counseling" },
      ...courses.map((c) => ({ value: c.slug, label: `${c.title} (${c.category})` })),
    ],
    [courses]
  );

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InquiryFormInput>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      courseSlug: prefilledCourse,
      preferredBatch: "ANY",
      message: "",
      consent: false,
      website: "",
      utmSource: initialValues?.utmSource ?? "",
      utmMedium: initialValues?.utmMedium ?? "",
      utmCampaign: initialValues?.utmCampaign ?? "",
    },
  });

  React.useEffect(() => {
    if (prefilledCourse) setValue("courseSlug", prefilledCourse);
  }, [prefilledCourse, setValue]);

  const selectedCourseSlug = watch("courseSlug");
  const selectedCourse = selectedCourseSlug
    ? courses.find((c) => c.slug === selectedCourseSlug)
    : null;

  const onSubmit = async (data: InquiryFormInput) => {
    const result = await submitInquiry({ ...data, turnstileToken });

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          setError(field as keyof InquiryFormInput, { message: messages[0] });
        }
      }
      toast({
        title: result.error,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Inquiry sent!",
      description: result.message,
      variant: "success",
    });
    setSubmitted(true);
    reset();
    setTurnstileToken("");
  };

  if (submitted) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="p-8 sm:p-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
            <CheckCircle2 className="size-8" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 text-balance">
            Thank you for your inquiry!
          </h3>
          <p className="mt-3 text-neutral-700 max-w-lg mx-auto leading-relaxed">
            We&apos;ve received your admission inquiry. Our counselor will reach out to you by phone or email within 1 business day to schedule your free counseling and demo class.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="outline" onClick={() => { setSubmitted(false); reset(); }}>
              Submit another inquiry
            </Button>
            <Link href="/courses" className={cn(buttonVariants(), "w-full sm:w-auto")}>
              Browse all courses
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasError = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {selectedCourse && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
          <BookOpenCheck className="size-5 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary mb-0.5">
              Pre-selected course
            </div>
            <div className="text-sm font-semibold text-neutral-900 truncate">
              {selectedCourse.title}
            </div>
          </div>
          <Badge variant="outline" className="ml-auto shrink-0">
            {selectedCourse.level}
          </Badge>
        </div>
      )}

      {hasError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
          Please fix the errors marked below before submitting.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fullName" className="flex items-center gap-1">
            <UserRound className="size-3.5 text-neutral-500" />
            Full Name
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder="e.g. Ram Sharma"
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "fullName-error" : undefined}
            className={cn(errors.fullName && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30")}
            {...register("fullName")}
          />
          {errors.fullName && (
            <p id="fullName-error" className="text-xs text-destructive">
              {errors.fullName.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone" className="flex items-center gap-1">
            <Phone className="size-3.5 text-neutral-500" />
            Phone
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="+977-XX-XXXXXXX"
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            className={cn(errors.phone && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30")}
            {...register("phone")}
          />
          {errors.phone && (
            <p id="phone-error" className="text-xs text-destructive">
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email" className="flex items-center gap-1">
            <Mail className="size-3.5 text-neutral-500" />
            Email <span className="text-neutral-400 font-normal">(optional)</span>
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={cn(errors.email && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30")}
            {...register("email")}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="courseSlug" className="flex items-center gap-1">
            <BookOpenCheck className="size-3.5 text-neutral-500" />
            Course of interest
          </Label>
          <Select
            id="courseSlug"
            value={watch("courseSlug") ?? ""}
            onChange={(e) => setValue("courseSlug", e.target.value, { shouldValidate: true })}
            options={courseOptions}
            placeholder="Select a course (optional)"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="preferredBatch" className="flex items-center gap-1">
            <Clock className="size-3.5 text-neutral-500" />
            Preferred batch time
            <span className="text-destructive">*</span>
          </Label>
          <Select
            id="preferredBatch"
            value={watch("preferredBatch")}
            onChange={(e) => setValue("preferredBatch", e.target.value as InquiryFormInput["preferredBatch"], { shouldValidate: true })}
            options={batchOptions}
          />
          {errors.preferredBatch && (
            <p className="text-xs text-destructive">{errors.preferredBatch.message}</p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="message" className="flex items-center gap-1">
            <MessageSquare className="size-3.5 text-neutral-500" />
            Message
            <span className="text-neutral-400 font-normal"> (optional)</span>
          </Label>
          <Textarea
            id="message"
            rows={4}
            placeholder="Tell us a bit about yourself, your goals, or any questions you have..."
            aria-invalid={!!errors.message}
            aria-describedby={errors.message ? "message-error" : undefined}
            className={cn(errors.message && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30")}
            {...register("message")}
          />
          {errors.message && (
            <p id="message-error" className="text-xs text-destructive">
              {errors.message.message}
            </p>
          )}
          <p className="text-[11px] text-neutral-500">
            {watch("message")?.length ?? 0}/1,000 characters
          </p>
        </div>
      </div>

      {/* Honeypot: hidden from users, must stay empty (docs/06 §8). */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>
      <input type="hidden" {...register("utmSource")} />
      <input type="hidden" {...register("utmMedium")} />
      <input type="hidden" {...register("utmCampaign")} />

      <div className="space-y-3 pt-1">
        <label className="flex items-start gap-2.5 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
            aria-invalid={!!errors.consent}
            aria-describedby={errors.consent ? "consent-error" : undefined}
            {...register("consent")}
          />
          <span className="leading-relaxed">
            I agree that {siteName} may store my details and contact me by phone or email about courses and admissions. <span className="text-destructive">*</span>
          </span>
        </label>
        {errors.consent && (
          <p id="consent-error" className="text-xs text-destructive">
            {errors.consent.message}
          </p>
        )}

        <TurnstileWidget onToken={setTurnstileToken} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <p className="text-[11px] text-neutral-500 leading-relaxed flex items-start gap-1.5">
          <ShieldCheck className="size-3.5 mt-0.5 shrink-0" />
          Your details are stored securely and never sold or shared with third parties.
        </p>
        <Button type="submit" size="lg" disabled={isSubmitting} className="shadow-lg shadow-primary/20 sm:w-auto w-full h-12 px-6">
          {isSubmitting ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="size-5" />
              Send Admission Inquiry
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
