import { Skeleton } from "@/components/ui/skeleton";

/**
 * The shape an admin screen takes while its server reads run: a heading, a filter
 * bar and a table. Deliberately the same boxes as the real page so the content
 * does not jump when it arrives, and `aria-busy` so a screen reader is told the
 * region is waiting rather than empty.
 */
export function SegmentLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Loading this page…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Skeleton className="h-11 flex-1" />
          <Skeleton className="h-11 w-full lg:w-56" />
          <Skeleton className="h-11 w-full lg:w-40" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="divide-y divide-neutral-100">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/5" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-7 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Card-shaped equivalent, for the student portal and dashboard-style screens. */
export function CardsLoading({ cards = 4 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Loading this page…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="rounded-xl border border-neutral-200 bg-white p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-6 w-2/3" />
            <Skeleton className="mt-4 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
