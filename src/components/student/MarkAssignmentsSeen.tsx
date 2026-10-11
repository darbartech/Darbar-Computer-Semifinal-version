"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { markAssignmentsSeenAction } from "@/server/actions/student";

/**
 * Clears the dashboard "new assignment" notice now that the student is looking at
 * the list. It runs as a Server Action after render rather than in the page
 * itself, so loading a page never writes to the database.
 */
export function MarkAssignmentsSeen({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    void markAssignmentsSeenAction().then((result) => {
      if (result.ok && result.data.cleared > 0) router.refresh();
    });
  }, [enabled, router]);

  return null;
}
