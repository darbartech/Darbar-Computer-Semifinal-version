import type { Metadata } from "next";
import { Users } from "lucide-react";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { TeamManager } from "@/components/admin/TeamManager";
import { requirePermission } from "@/server/session";
import { can } from "@/server/permissions";
import { adminListTeam } from "@/server/dal/team";
import { listRecentMedia } from "@/server/dal/media";
import { teamFilterSchema } from "@/lib/validators/team";

export const metadata: Metadata = {
  title: "Team",
  robots: { index: false, follow: false },
};

export default async function AdminTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("team.write");

  const sp = await searchParams;
  const raw = Object.fromEntries(
    Object.entries(sp).filter(([, value]) => typeof value === "string" && value !== "")
  );
  const filters = teamFilterSchema.parse(raw);

  const result = await adminListTeam({
    q: filters.q,
    isPublished: filters.isPublished,
    page: filters.page,
  });
  const library = await listRecentMedia();

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[{ label: "Dashboard", href: "/admin" }, { label: "Team" }]}
      />

      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          <Users className="size-6 text-primary" />
          Team
        </h1>
        <p className="text-sm text-neutral-600">
          {result.total} team member{result.total === 1 ? "" : "s"} in this view.
          Publishing a team member makes them visible on the About page and
          instructor listings immediately.
        </p>
      </div>

      <TeamManager
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageCount={result.pageCount}
        filters={{
          q: filters.q ?? "",
          isPublished: filters.isPublished ?? "",
        }}
        library={library}
        canWrite={can(user.role, "team.write")}
      />
    </div>
  );
}
