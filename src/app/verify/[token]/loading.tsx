import { Container } from "@/components/common/Container";

export default function VerifyLoading() {
  return (
    <Container className="py-10 sm:py-14">
      <p role="status" className="sr-only">
        Loading certificate details…
      </p>
      <div className="mx-auto w-full max-w-3xl flex flex-col gap-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-neutral-200 animate-pulse" />
          <div className="flex flex-col gap-2">
            <div className="h-8 w-64 bg-neutral-200 rounded animate-pulse" />
            <div className="h-4 w-80 bg-neutral-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Action bar skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-24 bg-neutral-200 rounded-full animate-pulse" />
            <div className="h-4 w-36 bg-neutral-200 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-28 bg-neutral-200 rounded-md animate-pulse" />
            <div className="h-9 w-24 bg-neutral-200 rounded-md animate-pulse" />
          </div>
        </div>

        {/* Card skeleton */}
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 bg-neutral-50/60 px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col gap-3">
              <div className="h-3 w-40 bg-neutral-200 rounded animate-pulse" />
              <div className="h-9 w-full max-w-md bg-neutral-200 rounded animate-pulse" />
            </div>
          </div>
          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 sm:grid-cols-2">
            <div className="flex flex-col gap-4">
              <div className="h-8 w-full max-w-xs bg-neutral-200 rounded animate-pulse" />
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[130px,1fr] gap-2 border-b border-neutral-100 py-1.5"
                  >
                    <div className="h-3 bg-neutral-200 rounded animate-pulse" />
                    <div className="h-4 bg-neutral-200 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-6">
              <div>
                <div className="mb-2 h-3 w-32 bg-neutral-200 rounded animate-pulse" />
                <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="p-3 flex items-start justify-between">
                      <div className="flex flex-col gap-1">
                        <div className="h-4 w-44 bg-neutral-200 rounded animate-pulse" />
                        <div className="h-3 w-56 bg-neutral-200 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 h-3 w-24 bg-neutral-200 rounded animate-pulse" />
                <div className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="p-3">
                      <div className="h-4 w-40 bg-neutral-200 rounded animate-pulse mb-1" />
                      <div className="h-3 w-52 bg-neutral-200 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-neutral-200 bg-neutral-50/60 px-6 py-4 sm:px-10">
            <div className="h-3 w-full max-w-lg bg-neutral-200 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </Container>
  );
}
