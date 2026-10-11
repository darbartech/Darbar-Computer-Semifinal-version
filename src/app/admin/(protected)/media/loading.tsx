import { MediaGridSkeleton } from "@/components/admin/MediaGrid";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminMediaLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <MediaGridSkeleton />
    </div>
  );
}