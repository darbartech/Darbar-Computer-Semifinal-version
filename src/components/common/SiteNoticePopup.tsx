"use client";
import * as React from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";

type VisibleNotice = {
  id: string;
  type: string;
  title: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  imageAlt: string;
};

/**
 * Notices this browser has already been shown and closed. Ids only — no visitor
 * profile is stored, and the list is capped because notice ids outlive the
 * notices themselves.
 */
const DISMISS_KEY = "darbar:dismissed-notices";
const MAX_REMEMBERED = 50;

const TYPE_VARIANT: Record<string, "success" | "destructive" | "default"> = {
  HOLIDAY: "success",
  CLOSURE: "destructive",
  ANNOUNCEMENT: "default",
};

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function rememberDismissed(ids: string[]) {
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...new Set(ids)].slice(-MAX_REMEMBERED)));
  } catch {
    // Storage disabled or full: the notice simply shows again next visit.
  }
}

function periodOf(notice: VisibleNotice): string | null {
  if (notice.startsAt && notice.endsAt) {
    return `${formatDate(notice.startsAt)} – ${formatDate(notice.endsAt)}`;
  }
  if (notice.startsAt) return `From ${formatDate(notice.startsAt)}`;
  if (notice.endsAt) return `Upto ${formatDate(notice.endsAt)}`;
  return null;
}

/**
 * The site-wide popup every visitor sees: holiday closures, lab down days,
 * batch announcements. It reads `/api/notices` in the browser rather than in the
 * layout, because the marketing pages are prerendered — a server-rendered notice
 * would be frozen into each page's HTML until it revalidated, up to an hour after
 * an editor published it.
 *
 * One notice at a time: the visitor reads a card, acknowledges it, and the next
 * one takes its place. Acknowledging remembers that notice id for this browser,
 * so a visitor is interrupted once per notice, not on every page they open.
 */
export function SiteNoticePopup() {
  const pathname = usePathname() ?? "";
  /** Notices still owed to this visitor; the head of the queue is on screen. */
  const [queue, setQueue] = React.useState<VisibleNotice[]>([]);
  /** How many the queue started with, for the "2 of 3" line. */
  const [total, setTotal] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    // `/student` renders inside this layout too, and signed-in students are
    // already interrupted by their assignment popup.
    if (pathname.startsWith("/student")) return;

    let cancelled = false;
    const dismissed = new Set(readDismissed());

    fetch("/api/notices")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { notices?: VisibleNotice[] } | null) => {
        if (cancelled || !data?.notices) return;
        const fresh = data.notices.filter((notice) => !dismissed.has(notice.id));
        if (fresh.length === 0) return;
        setQueue(fresh);
        setTotal(fresh.length);
        // Let the page paint first: a modal that appears mid-hydration reads as a
        // glitch, and the visitor may still be navigating.
        window.setTimeout(() => setOpen(true), 700);
      })
      .catch(() => {
        // A failed lookup is not worth interrupting a visitor for.
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (queue.length === 0) return null;

  const current = queue[0];
  const remaining = queue.length - 1;

  /**
   * The footer button sets our own state rather than the Dialog's, so it has to
   * record the dismissal itself — otherwise the same notice popped again on the
   * next page view.
   */
  const advance = () => {
    rememberDismissed([...readDismissed(), current.id]);
    if (remaining === 0) {
      setQueue([]);
      setOpen(false);
      return;
    }
    setQueue(queue.slice(1));
  };

  /** The X, backdrop and Escape mean "stop interrupting me": clear the run. */
  const acknowledgeAll = () => {
    rememberDismissed([...readDismissed(), ...queue.map((notice) => notice.id)]);
    setQueue([]);
    setOpen(false);
  };

  const period = periodOf(current);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) acknowledgeAll(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-5 text-primary" />
            Notice
          </DialogTitle>
          <DialogDescription>
            {total === 1
              ? "Announcement from the institute."
              : `Announcement ${total - queue.length + 1} of ${total} from the institute.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto px-6 pb-2">
          <article
            key={current.id}
            className="rounded-lg border border-neutral-200 bg-neutral-50 p-4"
          >
            {current.imageUrl && (
              <div className="relative mb-3 aspect-video w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-100">
                <Image
                  src={current.imageUrl}
                  alt={current.imageAlt}
                  fill
                  sizes="(max-width: 512px) 90vw, 480px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-neutral-900">{current.title}</h3>
              <Badge variant={TYPE_VARIANT[current.type] ?? "default"}>
                {current.type.toLowerCase()}
              </Badge>
            </div>
            {period && <p className="mt-1 text-xs font-medium text-neutral-500">{period}</p>}
            <p className="mt-2 whitespace-pre-line text-sm text-neutral-700">{current.body}</p>
          </article>
        </div>

        <DialogFooter>
          {remaining > 0 && (
            <span className="self-center text-xs text-neutral-500 sm:mr-auto">
              {remaining} more to read
            </span>
          )}
          <Button onClick={advance}>{remaining > 0 ? "Next notice" : "Got it"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
