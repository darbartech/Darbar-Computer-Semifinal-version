import { Container } from "@/components/common/Container";
import { NOINDEX_METADATA } from "@/lib/seo";
import { requireStudentProfile } from "@/server/student-session";
import { LogoutButton } from "@/components/student/LogoutButton";
import { StudentPortalNav } from "@/components/student/StudentPortalNav";
import { ProjectsManager } from "@/components/student/ProjectsManager";
import { listStudentProjects } from "@/server/dal/students";

export const metadata = {
  robots: NOINDEX_METADATA,
};

export default async function StudentPortfolioPage() {
  const { profile } = await requireStudentProfile();
  const projects = await listStudentProjects(profile.id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-900">My portfolio</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Build and publish your student portfolio. You control visibility from your profile.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-neutral-900">
            {profile.portfolioPublic && profile.portfolioSlug
              ? "Public"
              : profile.portfolioSlug
                ? "Unpublished"
                : "Not ready"}
          </p>
          {profile.portfolioSlug && (
            <a
              href={`/portfolio/${profile.portfolioSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              /portfolio/{profile.portfolioSlug}
            </a>
          )}
        </div>
      </div>
      <ProjectsManager
        projects={projects}
        portfolioSlug={profile.portfolioSlug}
        locked={profile.approvalStatus !== "APPROVED"}
      />
    </div>
  );
}
