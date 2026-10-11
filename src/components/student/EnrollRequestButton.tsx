"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestCourseEnrollmentAction } from "@/server/actions/student";

export function EnrollRequestButton({ courseId }: { courseId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [requested, setRequested] = React.useState(false);

  const onRequest = async () => {
    setPending(true);
    try {
      const result = await requestCourseEnrollmentAction({ courseId });
      if (!result.ok) {
        toast({ title: result.error, variant: "error" });
        return;
      }
      setRequested(true);
      toast({
        title: "Request sent",
        description: "An admin will review your enrollment request.",
        variant: "success",
      });
      router.refresh();
    } catch {
      toast({ title: "Could not send the request", description: "Check your connection and try again.", variant: "error" });
    } finally {
      setPending(false);
    }
  };

  if (requested) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0" />
        Enrollment requested — awaiting admin approval
      </p>
    );
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      onClick={onRequest}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <GraduationCap className="size-4" />
      )}
      Request enrollment
    </Button>
  );
}
