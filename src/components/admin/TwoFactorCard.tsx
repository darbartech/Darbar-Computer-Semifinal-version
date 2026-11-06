"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ShieldCheck, ShieldX, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  EMPTY_STEP_UP,
  isStepUpComplete,
  StepUpFields,
  stepUpPayload,
  type StepUpValue,
} from "@/components/admin/StepUpFields";
import {
  disableTwoFactorAction,
  finishTwoFactorSetupAction,
  startTwoFactorSetupAction,
} from "@/server/actions/two-factor";

/**
 * Enrolment for the staff second factor (fix guide §4).
 *
 * The QR is rendered on the server and arrives as a data URL, and the setup
 * secret only ever exists as that image plus the `otpauth://` line, so neither
 * lands in a client bundle. The backup codes are shown exactly once — they come
 * back from the first call and are dropped from state as soon as a code checks
 * out.
 */

type Stage = "idle" | "setup";

type SetupData = {
  qrDataUrl: string;
  totpURI: string;
  backupCodes: string[];
};

export function TwoFactorCard({
  enabled,
  setupRequired,
  requiredForRole = false,
}: {
  enabled: boolean;
  setupRequired: boolean;
  /** True when the role is not allowed to run without a second factor. */
  requiredForRole: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [stage, setStage] = React.useState<Stage>("idle");
  const [setup, setSetup] = React.useState<SetupData | null>(null);
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [stepUp, setStepUp] = React.useState<StepUpValue>(EMPTY_STEP_UP);
  const [stepUpError, setStepUpError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const reset = () => {
    setStage("idle");
    setSetup(null);
    setPassword("");
    setCode("");
    setStepUp(EMPTY_STEP_UP);
    setStepUpError(null);
    setFieldError(null);
  };

  const start = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setFieldError(null);
    let result: Awaited<ReturnType<typeof startTwoFactorSetupAction>>;
    try {
      result = await startTwoFactorSetupAction({ password });
    } catch {
      setIsBusy(false);
      toast({ title: "Could not start the setup. Please try again.", variant: "error" });
      return;
    }
    setIsBusy(false);
    if (!result.ok) {
      setFieldError(result.fieldErrors?.password?.[0] ?? result.error);
      return;
    }
    setSetup(result.data);
    setStage("setup");
  };

  const confirm = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setFieldError(null);
    let result: Awaited<ReturnType<typeof finishTwoFactorSetupAction>>;
    try {
      result = await finishTwoFactorSetupAction({ code });
    } catch {
      setIsBusy(false);
      toast({ title: "Could not check that code. Please try again.", variant: "error" });
      return;
    }
    setIsBusy(false);
    if (!result.ok) {
      setFieldError(result.fieldErrors?.code?.[0] ?? result.error);
      return;
    }
    reset();
    toast({
      title: "Two-factor is on",
      description: "Keep a backup code somewhere safe.",
      variant: "success",
    });
    // Better Auth replaced the session cookie while it turned the factor on, so
    // the server-rendered gate has to be re-read.
    router.refresh();
  };

  const disable = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setFieldError(null);
    setStepUpError(null);
    let result: Awaited<ReturnType<typeof disableTwoFactorAction>>;
    try {
      result = await disableTwoFactorAction({ password, ...stepUpPayload(stepUp) });
    } catch {
      setIsBusy(false);
      toast({ title: "Could not turn two-factor off. Please try again.", variant: "error" });
      return;
    }
    setIsBusy(false);
    // One 30-second window per code, right or wrong.
    setStepUp(EMPTY_STEP_UP);
    if (!result.ok) {
      // Whichever half of the login was refused gets the line under its own box.
      const passwordProblem = result.fieldErrors?.password?.[0];
      if (passwordProblem) setFieldError(passwordProblem);
      else setStepUpError(result.error);
      return;
    }
    setPassword("");
    toast({ title: "Two-factor turned off", variant: "success" });
    router.refresh();
  };

  if (enabled) {
    return (
      <Card className="max-w-3xl">
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-neutral-900">
                Two-factor is on
              </h2>
              <p className="text-sm text-neutral-600 mt-0.5">
                Your authenticator app is enrolled. If you lose it, sign in with one of the backup
                codes you were shown, then enrol the new app from here.
              </p>
              {requiredForRole && (
                <p className="mt-1 text-xs font-medium text-warning-foreground">
                  Your role is not allowed to work without a second factor: turning this off
                  closes the rest of the admin area until you enrol again.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="2fa-disable-password" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-neutral-500" aria-hidden="true" />
                Password
              </Label>
              <Input
                id="2fa-disable-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "2fa-disable-error" : undefined}
              />
              {fieldError && (
                <p id="2fa-disable-error" className="text-xs font-medium text-destructive">
                  {fieldError}
                </p>
              )}
            </div>
            <div className="flex-1">
              <StepUpFields
                value={stepUp}
                onChange={setStepUp}
                error={stepUpError}
                disabled={isBusy}
                idPrefix="2fa-disable"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={disable}
              disabled={isBusy || !isStepUpComplete(stepUp)}
            >
              {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              <ShieldX className="size-4" aria-hidden="true" />
              Turn off
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={setupRequired ? "border-warning/50 bg-warning/5 max-w-3xl" : "max-w-3xl"}>
      <CardContent className="p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <ShieldX
            className={
              setupRequired
                ? "mt-0.5 size-5 shrink-0 text-warning"
                : "mt-0.5 size-5 shrink-0 text-neutral-400"
            }
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight text-neutral-900">Two-factor</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              {setupRequired
                ? "Your role handles money and certificates, so an authenticator app is required before the rest of the admin area opens."
                : "Add an authenticator app so a stolen password alone cannot open this account."}
            </p>
          </div>
        </div>

        {stage === "idle" ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="2fa-start-password" className="flex items-center gap-1.5">
                <KeyRound className="size-3.5 text-neutral-500" aria-hidden="true" />
                Confirm your password
              </Label>
              <Input
                id="2fa-start-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "2fa-start-error" : undefined}
              />
              {fieldError && (
                <p id="2fa-start-error" className="text-xs font-medium text-destructive">
                  {fieldError}
                </p>
              )}
            </div>
            <Button type="button" onClick={start} disabled={isBusy || password.length === 0}>
              {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              <QrCode className="size-4" aria-hidden="true" />
              Show setup code
            </Button>
          </div>
        ) : (
          setup && (
            <div className="space-y-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                {/* The QR is a data URL generated on the server: no <Image> loader
                    applies to it, and it must never be fetched from a host. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setup.qrDataUrl}
                  alt="Scan this code with your authenticator app"
                  width={320}
                  height={320}
                  className="size-40 shrink-0 rounded-lg border border-neutral-200 bg-white p-1"
                />
                <div className="min-w-0 space-y-2">
                  <p className="text-sm text-neutral-600">
                    Scan it with Google Authenticator, Authy or 1Password. If the camera will not
                    focus, add the account by hand with this line:
                  </p>
                  <p className="break-all rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-xs text-neutral-800 select-all">
                    {setup.totpURI}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold text-neutral-900">Backup codes — shown once</h3>
                <p className="text-xs text-neutral-600">
                  Each works for one sign-in if you lose the app. Save them somewhere other than
                  this device; they cannot be shown again.
                </p>
                <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3" aria-label="Backup codes">
                  {setup.backupCodes.map((value) => (
                    <li
                      key={value}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-xs text-neutral-800 select-all"
                    >
                      {value}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="2fa-code">Code from your app</Label>
                  <Input
                    id="2fa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    aria-invalid={fieldError ? true : undefined}
                    aria-describedby={fieldError ? "2fa-code-error" : undefined}
                  />
                  {fieldError && (
                    <p id="2fa-code-error" className="text-xs font-medium text-destructive">
                      {fieldError}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={reset} disabled={isBusy}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={confirm} disabled={isBusy || code.length < 6}>
                    {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    Turn on two-factor
                  </Button>
                </div>
              </div>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
