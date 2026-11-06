"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Loader2, UserRound, Mail, Phone, KeyRound } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { TurnstileWidget } from "@/components/forms/TurnstileWidget";
import { registerStudent } from "@/server/actions/student-auth";
import { studentRegisterFormSchema } from "@/lib/validators/student";
import { cn } from "@/lib/utils";

type StudentRegisterInput = z.input<typeof studentRegisterFormSchema>;

export function StudentRegisterForm() {
  const { toast } = useToast();
  const router = useRouter();
  // The widget solves the check before the person presses the button, so the
  // token lives beside the form rather than inside it (docs 01 §S3).
  const [turnstileToken, setTurnstileToken] = React.useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentRegisterInput>({
    resolver: zodResolver(studentRegisterFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      website: "",
    },
  });

  const onSubmit = async (data: StudentRegisterInput) => {
    const result = await registerStudent({ ...data, turnstileToken });
    if (!result.ok) {
      toast({ title: result.error, variant: "error" });
      setTurnstileToken("");
      return;
    }
    toast({
      title: "Check your email",
      description: "If this email can be used, check your inbox to continue.",
      variant: "success",
    });
    router.push("/student");
    router.refresh();
  };

  const hasError = Object.keys(errors).length > 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {hasError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          role="alert"
        >
          Please fix the errors marked below before submitting.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="name" className="flex items-center gap-1.5">
            <UserRound className="size-3.5 text-neutral-500" />
            Full name
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            autoComplete="name"
            placeholder="Ram Sharma"
            aria-invalid={!!errors.name}
            className={cn(errors.name && "border-destructive focus-visible:ring-destructive/30")}
            {...register("name")}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
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
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="phone" className="flex items-center gap-1.5">
            <Phone className="size-3.5 text-neutral-500" />
            Phone <span className="text-neutral-400 font-normal">(optional)</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="98XXXXXXXX"
            aria-invalid={!!errors.phone}
            {...register("phone")}
          />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="password" className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-neutral-500" />
            Password
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            aria-invalid={!!errors.password}
            className={cn(errors.password && "border-destructive focus-visible:ring-destructive/30")}
            {...register("password")}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="confirmPassword" className="flex items-center gap-1.5">
            <KeyRound className="size-3.5 text-neutral-500" />
            Confirm password
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Re-enter your password"
            aria-invalid={!!errors.confirmPassword}
            className={cn(
              errors.confirmPassword && "border-destructive focus-visible:ring-destructive/30"
            )}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword && (
            <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>
      </div>

      {/* Honeypot: hidden from users, must stay empty (docs/06 §8). */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="student-register-website">Website</label>
        <input
          id="student-register-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register("website")}
        />
      </div>

      <TurnstileWidget onToken={setTurnstileToken} theme="dark" />

      <div className="flex flex-col sm:flex-row gap-3 pt-1">
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={isSubmitting || !turnstileToken}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Create student account
        </Button>
        <Link
          href="/student/login"
          className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}
        >
          Already have an account?
        </Link>
      </div>
    </form>
  );
}
