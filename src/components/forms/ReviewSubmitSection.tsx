"use client";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star, Send, CheckCircle2, Loader2, UserRound, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { submitReview } from "@/server/actions/public-forms";
import { reviewFormSchema, type ReviewFormInput } from "@/lib/validators/testimonials";
import { cn } from "@/lib/utils";

export function ReviewSubmitSection() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState("");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReviewFormInput>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      name: "",
      courseLabel: "",
      rating: 5,
      quote: "",
      consentGiven: false,
      website: "",
    },
  });

  const rating = watch("rating");
  const quoteLength = watch("quote")?.length ?? 0;

  /** A radiogroup promises one tab stop and arrow keys, not five tabbable stars. */
  const onRatingKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const offsets: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
    };
    const offset = offsets[event.key];
    if (offset === undefined && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 1
        : event.key === "End"
          ? 5
          : Math.min(Math.max((rating ?? 1) + offset, 1), 5);
    setValue("rating", next, { shouldValidate: true });
  };

  const onSubmit = async (data: ReviewFormInput) => {
    const result = await submitReview({ ...data, turnstileToken });

    if (!result.ok) {
      for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
        if (messages?.[0]) {
          setError(field as keyof ReviewFormInput, { message: messages[0] });
        }
      }
      toast({ title: result.error, variant: "error" });
      return;
    }

    toast({
      title: "Review submitted!",
      description: result.message,
      variant: "success",
    });
    setSubmitted(true);
    reset();
    setTurnstileToken("");
  };

  return (
    <section aria-labelledby="review-form-heading" className="max-w-3xl">
      <div className="mb-6">
        <h2 id="review-form-heading" className="text-2xl font-bold tracking-tight text-neutral-900">
          Share Your Experience
        </h2>
        <p className="text-sm text-neutral-600 mt-1">
          Tell future students what the course was really like. Reviews are published after a quick
          moderation.
        </p>
      </div>

      <Card className="border-neutral-200 bg-white shadow-sm">
        <CardContent className="p-5 sm:p-8">
          {submitted ? (
            <div className="py-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
                <CheckCircle2 className="size-8" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 text-balance">
                Thank you — your review has been received!
              </h3>
              <p className="mx-auto mt-3 max-w-lg leading-relaxed text-neutral-700">
                Our team will read it and publish it once approved. It will then appear with the
                student reviews on the home page.
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setSubmitted(false)}>
                Write another review
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="review-name" className="flex items-center gap-1">
                    <UserRound className="size-3.5 text-neutral-500" />
                    Your Name
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="review-name"
                    autoComplete="name"
                    placeholder="Sita Sharma"
                    aria-invalid={!!errors.name}
                    className={cn(errors.name && "border-destructive focus-visible:ring-destructive/30")}
                    {...register("name")}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="review-course" className="flex items-center gap-1">
                    <BookOpen className="size-3.5 text-neutral-500" />
                    Course{" "}
                    <span className="font-normal text-neutral-400">(optional)</span>
                  </Label>
                  <Input
                    id="review-course"
                    placeholder="e.g. Data Analytics with Power BI"
                    aria-invalid={!!errors.courseLabel}
                    className={cn(errors.courseLabel && "border-destructive focus-visible:ring-destructive/30")}
                    {...register("courseLabel")}
                  />
                  {errors.courseLabel && (
                    <p className="text-xs text-destructive">{errors.courseLabel.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label id="review-rating-label">Your Rating</Label>
                <div
                  role="radiogroup"
                  aria-labelledby="review-rating-label"
                  className="flex items-center gap-1"
                  onKeyDown={onRatingKeyDown}
                >
                  {Array.from({ length: 5 }).map((_, i) => {
                    const value = i + 1;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} star${value > 1 ? "s" : ""}`}
                        tabIndex={rating === value ? 0 : -1}
                        onClick={() => setValue("rating", value, { shouldValidate: true })}
                        className="rounded-full p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <Star
                          className={cn(
                            "size-7 sm:size-8",
                            value <= rating ? "fill-primary text-primary" : "fill-neutral-100 text-neutral-300"
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
                {errors.rating && <p className="text-xs text-destructive">{errors.rating.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="review-quote">
                  Your Review
                  <span className="text-destructive"> *</span>
                </Label>
                <Textarea
                  id="review-quote"
                  rows={5}
                  placeholder="What did you study, what stood out, and would you recommend it?"
                  aria-invalid={!!errors.quote}
                  className={cn(errors.quote && "border-destructive focus-visible:ring-destructive/30")}
                  {...register("quote")}
                />
                {errors.quote && <p className="text-xs text-destructive">{errors.quote.message}</p>}
                <p className="text-[11px] text-neutral-500">{quoteLength}/1,000 characters</p>
              </div>

              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    aria-invalid={!!errors.consentGiven}
                    {...register("consentGiven")}
                  />
                  <span>
                    I agree that this review may be published on the website after moderation.
                    <span className="text-destructive"> *</span>
                  </span>
                </label>
                {errors.consentGiven && (
                  <p className="text-xs text-destructive">{errors.consentGiven.message}</p>
                )}
              </div>

              {/* Honeypot: hidden from users, must stay empty (docs/06 §8). */}
              <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="review-website">Website</label>
                <input id="review-website" type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
              </div>

              <TurnstileWidget onToken={setTurnstileToken} />

              <div className="flex flex-col items-stretch justify-between gap-4 pt-2 sm:flex-row sm:items-end">
                <p className="max-w-md text-[11px] leading-relaxed text-neutral-500">
                  Reviews are checked before appearing on the site. Please keep it respectful and
                  honest — no personal information of staff or other students.
                </p>
                <Button
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                  className="h-12 w-full px-6 shadow-lg shadow-primary/20 sm:w-auto"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-5 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="size-5" />
                      Submit Review
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
