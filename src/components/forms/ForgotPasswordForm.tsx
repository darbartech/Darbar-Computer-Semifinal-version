"use client";
import * as React from "react";
import Link from "next/link";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Loader2, KeySquare, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { requestPasswordResetAction } from "@/server/actions/password-reset";
import { requiredEmailSchema } from "@/lib/validators/shared";
import { cn } from "@/lib/utils";

type Values = { email: string };

/**
 * "Forgot password?" request (docs 01 §S4). Whatever the answer, the page shows
 * the same "check your email" panel — an unknown address must not look different,
 * otherwise the form doubles as an account enumerator.
 */
export function ForgotPasswordForm({
  portal,
  backHref,
  backLabel,
}: {
  portal: "student" | "staff";
  backHref: string;
  backLabel: string;
}) {
  const { toast } = useToast();
  const [turnstileToken, setTurnstileToken] = React.useState("");
  const [sent, setSent] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    // Only the email is a form field; the portal and the Turnstile token are
    // attached when the action is called.
    resolver: zodResolver(z.object({ email: requiredEmailSchema })),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: Values) => {
    const result = await requestPasswordResetAction({
      email: data.email,
      portal,
      turnstileToken,
    });
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      setTurnstileToken("");
      return;
    }
    setSent(result.message);
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-neutral-900">Request received</p>
            <p className="text-sm text-neutral-600">{sent}</p>
            <p className="text-xs text-neutral-500">
              Nothing after a few minutes? That address may not be on our records —{" "}
              <Link
                href="/contact"
                className="underline underline-offset-2 hover:text-neutral-900"
              >
                contact the front desk
              </Link>{" "}
              and we will reset it for you.
            </p>
          </div>
        </div>
        <Link
          href={backHref}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {errors.email && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          Please fix the errors marked below before submitting.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email" className="flex items-center gap-1.5">
          <Mail className="size-3.5 text-neutral-500" />
          Email
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          aria-invalid={!!errors.email}
          className={cn(errors.email && "border-destructive focus-visible:ring-destructive/30")}
          {...register("email")}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        {/* The page cannot say "no account found" (docs 01 §S4), so it says the
            thing people actually get wrong instead: which address is on file. */}
        <p className="text-xs text-neutral-500">
          {portal === "staff"
            ? "Use the email on your staff account — the one your owner created for you."
            : "Use the email from your admission form. A newer address will not match yet."}
        </p>
      </div>

      <TurnstileWidget onToken={setTurnstileToken} />

      <Button type="submit" className="w-full" disabled={isSubmitting || !turnstileToken}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <KeySquare className="size-4" />
        )}
        Send reset link
      </Button>

      <Link
        href={backHref}
        className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>
    </form>
  );
}
