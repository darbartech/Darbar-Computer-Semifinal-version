import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Award, ExternalLink, Code, Contact, Globe, Sparkles, GraduationCap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/common/Badge";
import { Container } from "@/components/common/Container";
import { getPublicPortfolioBySlug } from "@/server/dal/students";
import { getSiteSettings } from "@/server/dal/settings";
import { formatDate } from "@/lib/format";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [portfolio, settings] = await Promise.all([
    getPublicPortfolioBySlug(slug),
    getSiteSettings(),
  ]);

  if (!portfolio) {
    // `path` even for the miss: without it this page's canonical would name the
    // home page, telling Google an unknown portfolio slug is a duplicate of "/".
    return buildMetadata({ title: "Portfolio not found", path: `/portfolio/${slug}` }, settings);
  }

  return buildMetadata(
    {
      title: `${portfolio.name} — Student Portfolio`,
      description: portfolio.headline ?? `Student portfolio of ${portfolio.name} on DarbarTech.`,
      path: `/portfolio/${portfolio.slug}`,
    },
    settings
  );
}

export default async function PublicPortfolioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const portfolio = await getPublicPortfolioBySlug(slug);

  if (!portfolio) {
    notFound();
  }

  return (
    <main className="bg-neutral-50/60">
      <div className="border-b border-neutral-200 bg-white">
        <Container size="xl" className="py-10">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
              {portfolio.photoUrl ? (
                <Image
                  src={portfolio.photoUrl}
                  alt={portfolio.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-neutral-400">
                  {portfolio.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-3">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{portfolio.name}</h1>
                {portfolio.headline && (
                  <p className="text-lg text-neutral-600 mt-1">{portfolio.headline}</p>
                )}
                <p className="text-sm text-neutral-500 mt-1">Student ID: {portfolio.studentCode}</p>
              </div>
              {portfolio.bio && <p className="max-w-2xl text-sm text-neutral-700">{portfolio.bio}</p>}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {portfolio.githubUrl && (
                  <a
                    href={portfolio.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-neutral-700 hover:text-primary"
                  >
                    <Code className="size-4" />
                    GitHub
                  </a>
                )}
                {portfolio.linkedinUrl && (
                  <a
                    href={portfolio.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-neutral-700 hover:text-primary"
                  >
                    <Contact className="size-4" />
                    LinkedIn
                  </a>
                )}
                {portfolio.websiteUrl && (
                  <a
                    href={portfolio.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-neutral-700 hover:text-primary"
                  >
                    <Globe className="size-4" />
                    Website
                  </a>
                )}
              </div>
              {portfolio.skills.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {portfolio.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      <Sparkles className="size-3 mr-1" />
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
              {portfolio.interests.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {portfolio.interests.map((interest) => (
                    <Badge key={interest} variant="outline" className="text-xs">
                      {interest}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Container>
      </div>

      <Container size="xl" className="py-10 space-y-10">
        {portfolio.projects.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Projects</h2>
              <p className="text-sm text-neutral-600 mt-1">Selected work</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {portfolio.projects.map((project) => (
                <Card key={project.id} className="overflow-hidden flex flex-col">
                  <div className="relative aspect-[16/9] bg-neutral-100">
                    {project.coverUrl ? (
                      <Image
                        src={project.coverUrl}
                        alt={project.title}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-300">
                        <Sparkles className="size-10" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6 flex-1 flex flex-col gap-3">
                    <h3 className="text-lg font-semibold text-neutral-900">{project.title}</h3>
                    {project.description && (
                      <p className="text-sm text-neutral-600">{project.description}</p>
                    )}
                    {project.techStack.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {project.techStack.map((tech) => (
                          <Badge key={tech} variant="outline" className="text-[11px]">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-3 pt-2 text-sm">
                      {project.liveUrl && (
                        <a
                          href={project.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="size-4" />
                          Live demo
                        </a>
                      )}
                      {project.repoUrl && (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 font-medium text-neutral-700 hover:underline"
                        >
                          <Code className="size-4" />
                          Source code
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {portfolio.certificates.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Certificates</h2>
              <p className="text-sm text-neutral-600 mt-1">Issued by DarbarTech</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {portfolio.certificates.map((cert) => (
                <Card key={cert.id}>
                  <CardContent className="p-5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-neutral-900 truncate">{cert.courseName}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        {cert.certificateNumber && <span>#{cert.certificateNumber}</span>}
                        {cert.issueDate && <span>Issued {formatDate(cert.issueDate)}</span>}
                      </div>
                    </div>
                    {cert.verificationToken && (
                      <Link
                        href={`/verify/${cert.verificationToken}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline shrink-0"
                      >
                        <Award className="size-4" />
                        Verify
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {portfolio.completedCourses.length > 0 && (
          <section>
            <div className="mb-5">
              <h2 className="text-2xl font-semibold tracking-tight text-neutral-900">Completed courses</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {portfolio.completedCourses.map((course) => (
                <Badge key={course.slug} variant="outline" className="text-xs">
                  <GraduationCap className="size-3 mr-1" />
                  {course.title}
                </Badge>
              ))}
            </div>
          </section>
        )}

        {portfolio.projects.length === 0 &&
          portfolio.certificates.length === 0 &&
          portfolio.completedCourses.length === 0 && (
            <Card>
              <CardContent className="p-10 text-center">
                <p className="text-sm text-neutral-600">
                  This portfolio is public, but no projects, certificates or completed courses are published yet.
                </p>
              </CardContent>
            </Card>
          )}
      </Container>
    </main>
  );
}
