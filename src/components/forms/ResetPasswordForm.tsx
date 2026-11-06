"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { resetPasswordAction } from "@/server/actions/password-reset";
import { newPasswordPairSchema } from "@/lib/validators/password-reset";
import { cn } from "@/lib/utils";

type Values = { newPassword: string; confirmPassword: string };

/**
 * Chooses a new password with the token the email link carried (docs 01 §S4).
 * The token travels as a hidden field, never rendered, and the server consumes it,
 * so a reload of this page after a successful reset cannot reuse it.
 */
export function ResetPasswordForm({
  portal,
  token,
  loginHref,
  loginLabel,
}: {
  portal: "student" | "staff";
  token: string;
  loginHref: string;
  loginLabel: string;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(newPasswordPairSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (data: Values) => {
    const result = await resetPasswordAction({
      token,
      portal,
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
    });
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      return;
    }
    toast({ title: "Password updated", description: result.message, variant: "success" });
    router.push(result.redirectTo ?? loginHref);
    router.refresh();
  };

  const hasFieldErrors = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {(hasFieldErrors || !token) && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {hasFieldErrors
            ? "Please fix the errors marked below before submitting."
            : "This reset link is incomplete. Please request a new one."}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="newPassword" className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-neutral-500" />
          New password
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          placeholder="At least 10 characters"
          aria-invalid={!!errors.newPassword}
          className={cn(errors.newPassword && "border-destructive focus-visible:ring-destructive/30")}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p className="text-xs text-destructive">{errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword" className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-neutral-500" />
          Confirm password
          <span className="text-destructive">*</span>
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
          aria-invalid={!!errors.confirmPassword}
          className={cn(
            errors.confirmPassword && "border-destructive focus-visible:ring-destructive/30"
          )}
          {...register("confirmPassword", { deps: ["newPassword"] })}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <KeyRound className="size-4" />
        )}
        Set new password
      </Button>

      <Link
        href={loginHref}
        className={cn(buttonVariants({ variant: "ghost" }), "w-full")}
      >
        <ArrowLeft className="size-4" />
        {loginLabel}
      </Link>
    </form>
  );
}
