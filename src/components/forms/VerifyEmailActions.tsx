"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { logoutStudent, resendVerificationEmailAction } from "@/server/actions/student-auth";

/**
 * The two controls on the verification interstitial (docs 01 §S3): ask for
 * another link, or leave the account that is signed in — the second matters
 * because the address on the session may not be the one the student meant to use.
 */
export function VerifyEmailActions({ email }: { email: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "switching">("idle");

  async function resend() {
    setState("sending");
    const result = await resendVerificationEmailAction();
    setState(result.ok ? "sent" : "idle");
    toast({
      title: result.ok ? result.message : result.error,
      variant: result.ok ? "success" : "error",
    });
  }

  async function switchAccount() {
    setState("switching");
    await logoutStudent();
    router.push("/student/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-500">
        Sent to <span className="font-medium text-neutral-700">{email}</span>
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={resend} disabled={state === "sending" || state === "sent"} className="w-full sm:w-auto">
          {state === "sending" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MailCheck className="size-4" />
          )}
          {state === "sent" ? "Link re-sent" : "Resend email"}
        </Button>
        <Button
          variant="outline"
          onClick={switchAccount}
          disabled={state === "switching"}
          className="w-full sm:w-auto"
        >
          {state === "switching" ? <Loader2 className="size-4 animate-spin" /> : null}
          Use another email
        </Button>
      </div>
    </div>
  );
}
