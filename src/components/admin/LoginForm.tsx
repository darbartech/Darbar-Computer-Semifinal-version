"use client";
import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  LogIn,
  Loader2,
  Mail,
  KeyRound,
  ShieldCheck,
  ArrowLeft,
  Hexagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithPassword, verifyStaffSignInTwoFactorAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

const AdminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email").max(200),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
});

type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

const GENERIC_ERROR = "Email or password is incorrect";

/** Backup codes are handed out as `xxxxx-xxxxx`; a typed dash is optional. */
const backupCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-zA-Z]{5}(-?[0-9a-zA-Z]{5})?$/, "Enter a backup code as it was shown to you");

export function LoginForm({ nextPath = "/techdarbar" }: { nextPath?: string }) {
  const router = useRouter();
  const [genericError, setGenericError] = React.useState<string | null>(null);
  /**
   * Set once the password is accepted and an authenticator is owed (fix guide §4).
   * Better Auth deleted the session it had made, so nothing is unlocked until the
   * code step answers — but the address is known, and the code form keys its
   * throttling bucket with it.
   */
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);
  const [useBackupCode, setUseBackupCode] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [isCheckingCode, setIsCheckingCode] = React.useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(AdminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: AdminLoginInput) => {
    setGenericError(null);
    const result = await signInWithPassword(data);
    if (!result.ok) {
      setGenericError(result.error ?? GENERIC_ERROR);
      return;
    }
    if (result.secondFactor) {
      setPendingEmail(data.email.trim().toLowerCase());
      setCode("");
      setCodeError(null);
      return;
    }
    router.push(nextPath);
    router.refresh();
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isCheckingCode) return;
    if (!pendingEmail) return;
    if (useBackupCode && !backupCodeSchema.safeParse(code).success) {
      setCodeError("Enter a backup code as it was shown to you");
      return;
    }
    setIsCheckingCode(true);
    setCodeError(null);
    let result: Awaited<ReturnType<typeof verifyStaffSignInTwoFactorAction>>;
    try {
      result = await verifyStaffSignInTwoFactorAction({
        email: pendingEmail,
        code: useBackupCode ? code.trim() : code,
        method: useBackupCode ? "backup" : "totp",
      });
    } catch {
      setIsCheckingCode(false);
      setCodeError("Could not check that code. Please try again.");
      return;
    }
    setIsCheckingCode(false);
    if (!result.ok) {
      setCodeError(result.error);
      return;
    }
    router.push(nextPath);
    router.refresh();
  };

  /** Start over: the challenge cookie is still there, but the password is not. */
  const backToPassword = () => {
    setPendingEmail(null);
    setCode("");
    setCodeError(null);
    setUseBackupCode(false);
    setValue("password", "");
  };

  const hasFieldErrors = Object.keys(errors).length > 0;

  if (pendingEmail) {
    return (
      <form onSubmit={submitCode} noValidate className="space-y-5">
        <div className="space-y-1">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-neutral-900">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Two-factor code
          </h2>
          <p className="text-sm text-neutral-600">
            Enter the six-digit code from your authenticator app for{" "}
            <span className="font-medium text-neutral-800">{pendingEmail}</span>.
          </p>
        </div>

        {codeError && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {codeError}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="two-factor-code" className="flex items-center gap-1.5">
            <Hexagon className="size-3.5 text-neutral-500" aria-hidden="true" />
            {useBackupCode ? "Backup code" : "Code"}
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="two-factor-code"
            inputMode={useBackupCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            maxLength={useBackupCode ? 11 : 6}
            placeholder={useBackupCode ? "abcde-fghij" : "123456"}
            value={code}
            onChange={(e) =>
              setCode(useBackupCode ? e.target.value : e.target.value.replace(/\D/g, ""))
            }
            aria-invalid={codeError ? true : undefined}
            className={cn("font-mono", codeError && "border-destructive")}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              setUseBackupCode((value) => !value);
              setCode("");
              setCodeError(null);
            }}
          >
            {useBackupCode ? "Use my app code instead" : "Lost the app? Use a backup code"}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900"
            onClick={backToPassword}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back
          </button>
        </div>

        <Button type="submit" className="w-full" disabled={isCheckingCode || code.length < 6}>
          {isCheckingCode ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="size-4" aria-hidden="true" />
          )}
          Verify and sign in
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {(hasFieldErrors || genericError) && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          {genericError ?? "Please fix the errors marked below before submitting."}
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
          autoComplete="username"
          placeholder="admin@example.com"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={cn(errors.email && "border-destructive focus-visible:ring-destructive/30")}
          {...register("email")}
        />
        {errors.email && (
          <p id="email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-neutral-500" />
            Password
            <span className="text-destructive">*</span>
          </Label>
          {/* docs 01 §S4 */}
          <Link
            href="/techdarbar/forgot-password"
            className="text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? "password-error" : undefined}
          className={cn(errors.password && "border-destructive focus-visible:ring-destructive/30")}
          {...register("password")}
        />
        {errors.password && (
          <p id="password-error" className="text-xs text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <LogIn className="size-4" />
        )}
        Sign in
      </Button>
    </form>
  );
}