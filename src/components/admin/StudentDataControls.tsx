"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { StepUpDialog } from "@/components/admin/StepUpDialog";
import { stepUpPayload } from "@/components/admin/StepUpFields";
import {
  eraseStudentDataAction,
  exportStudentDataAction,
} from "@/server/actions/student-privacy";

/**
 * The two data-request buttons on a student's record (brief task 9).
 *
 * They are the whole UI for a subject access request and an erasure request, and
 * both hide themselves unless the signed-in person holds `student.export` /
 * `student.erase`. Nothing here decides whether the click worked: the code goes
 * into the action, and `requireStepUp()` plus the permission check answer it.
 *
 * The export never becomes a link. A download URL would have to carry the
 * authenticator code in its query string, and that string is written to the
 * browser history and to the server's access log — the file would be readable by
 * anyone who found either. So the answer comes back through this POST and the
 * browser assembles the file from it.
 */

type AskKind = "export" | "erase";

/** What `StepUpDialog` hands back: the two keys `requireStepUp` reads. */
type AskPayload = ReturnType<typeof stepUpPayload>;

const COPY: Record<
  AskKind,
  {
    title: string;
    description: string;
    confirm: string;
    variant: "destructive" | "default";
  }
> = {
  export: {
    title: "Export this student's data",
    description:
      "A JSON file with everything the institute holds about this person: their account, profile, enquiry, classes, invoices and receipts, certificates, portfolio, submissions, uploads and sign-in history. Staff identities are left out. The export itself is written to the audit trail.",
    confirm: "Download JSON",
    variant: "default",
  },
  erase: {
    title: "Erase this student's identity",
    description:
      "The name, email, phone, date of birth, address, bio, links, photo and public portfolio are replaced or removed; the account is signed out and can no longer sign in. Invoices, receipts, enrollments and issued certificates stay — the ledger is kept for legal retention. This cannot be undone from here.",
    confirm: "Erase identity",
    variant: "destructive",
  },
};

export function StudentDataControls({
  studentId,
  studentName,
  can,
}: {
  studentId: string;
  studentName: string;
  can: { export: boolean; erase: boolean };
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [ask, setAsk] = React.useState<AskKind | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!can.export && !can.erase) return null;

  const close = () => {
    setAsk(null);
    setError(null);
  };

  const submit = async (payload: AskPayload) => {
    if (!ask || busy) return;
    setBusy(true);
    setError(null);

    if (ask === "export") {
      const result = await exportStudentDataAction({ id: studentId, ...payload });
      setBusy(false);
      if (!result.ok) {
        // The dialog stays open: a mistyped code deserves a second try, not a
        // new click through the whole flow.
        setError(result.error);
        return;
      }
      downloadJson(result.data.filename, result.data.document);
      toast({ title: "Export downloaded", variant: "success" });
      close();
      return;
    }

    const result = await eraseStudentDataAction({ id: studentId, ...payload });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast({
      title: "Identity erased",
      description: `${studentName}'s invoices and receipts stay in the ledger.`,
      variant: "success",
    });
    close();
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-600">
        A student can ask what the institute holds about them, or ask for it
        removed. Both answers need your authenticator code and both are recorded.
      </p>
      <div className="flex flex-wrap gap-2">
        {can.export && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAsk("export")}
            disabled={ask !== null}
          >
            <Download className="size-4" aria-hidden="true" />
            Export data
          </Button>
        )}
        {can.erase && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setAsk("erase")}
            disabled={ask !== null}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Erase identity
          </Button>
        )}
      </div>
      {!can.erase && (
        <p className="flex items-start gap-1.5 text-xs text-neutral-500">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Erasing a record is left to the Super Admin who holds the export too.
        </p>
      )}

      <StepUpDialog
        open={ask !== null}
        title={ask ? COPY[ask].title : ""}
        description={ask ? COPY[ask].description : ""}
        confirmLabel={ask ? COPY[ask].confirm : ""}
        variant={ask ? COPY[ask].variant : "destructive"}
        pending={busy}
        error={error}
        onCancel={close}
        onConfirm={submit}
      />
    </div>
  );
}

/** The browser-side half of the download: a blob, an object URL, a clicked anchor. */
function downloadJson(filename: string, contents: unknown): void {
  const blob = new Blob([`${JSON.stringify(contents, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  // The object URL pins the whole file in memory until this runs, and a person
  // who exports three students in a row should not be holding three files.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
