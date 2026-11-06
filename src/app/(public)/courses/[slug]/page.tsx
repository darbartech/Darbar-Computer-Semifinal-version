import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  CheckCircle2,
  ArrowRight,
  Users,
  GraduationCap,
  Award,
  Briefcase,
  MapPin,
  RefreshCw,
  Sparkles,
  FolderKanban,
  Wrench,
  BookOpen,
} from "lucide-react";
import { Container } from "@/components/common/Container";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Badge } from "@/components/common/Badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CourseCard } from "@/components/sections/CourseCard";
import { CourseEnrollArea } from "@/components/student/CourseEnrollArea";
import {
  getPublishedCourseBySlug,
  getRelatedCourses,
  listPublishedCourseSlugs,
} from "@/server/dal/courses";
import { getSeatsSummaryForCourse } from "@/server/dal/batches";
import { getSiteSettings } from "@/server/dal/settings";
import { safeStaticParams } from "@/lib/static-params";
import {
  buildMetadata,
  courseJsonLd,
  breadcrumbListJsonLd,
} from "@/lib/seo";
import { JsonLd } from "@/components/common/JsonLd";
import { cn } from "@/lib/utils";

/**
 * Every published course is prerendered at build, and a course published after
 * the build is generated on request and cached afterwards (`dynamicParams`
 * defaults to true). Re-audit #1: this list was removed when the root layout
 * still claimed `force-dynamic` for the whole site, because a prerender list
 * built under that flag was rendered and then thrown away.
 */
export function generateStaticParams() {
  return safeStaticParams("/courses/[slug]", listPublishedCourseSlugs);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [course, settings] = await Promise.all([
    getPublishedCourseBySlug(slug),
    getSiteSettings(),
  ]);
  if (!course) {
    return buildMetadata({ title: "Course Not Found", path: `/courses/${slug}` }, settings);
  }
  return buildMetadata(
    {
      title: course.seoTitle || course.title,
      description: course.seoDescription || course.shortDescription,
      path: `/courses/${course.slug}`,
      images: [course.image],
      keywords: [course.title, course.category, course.level, ...course.skillsGained, "Darbar Computer course"],
    },
    settings
  );
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // Draft and archived courses are filtered inside the DAL, so they 404 here.
  const course = await getPublishedCourseBySlug(slug);
  if (!course) notFound();

  const related = await getRelatedCourses(slug, 3);
  // Live seat counts, not the marketing copy (docs 02 B1).
  const seats = await getSeatsSummaryForCourse(course.id);
  const settings = await getSiteSettings();
  const { general, everyCourseIncludes } = settings;
  const siteUrl = general.siteUrl;
  const jsonLd = courseJsonLd(course, settings);
  const breadcrumbJsonLd = breadcrumbListJsonLd([
    { name: "Home", item: siteUrl },
    { name: "Courses", item: `${siteUrl}/courses` },
    { name: course.category, item: `${siteUrl}/courses?category=${encodeURIComponent(course.category)}` },
    { name: course.title },
  ]);

  return (
    <>
      <JsonLd data={jsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs
            items={[
              { label: "Courses", href: "/courses" },
              {
                label: course.category,
                href: `/courses?category=${encodeURIComponent(course.category)}`,
              },
              { label: course.title },
            ]}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2 mb-3">
            <Badge variant="default">{course.category}</Badge>
            <Badge variant="outline">{course.level}</Badge>
            {course.featured && <Badge variant="secondary">Featured</Badge>}
            {course.internship && (
              <Badge variant="success" className="gap-1">
                <Briefcase className="size-3" />
                {course.internship}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-neutral-900 text-balance max-w-4xl">
            {course.title}
          </h1>
          <p className="mt-3 text-base sm:text-lg font-semibold text-secondary leading-relaxed max-w-3xl text-pretty">
            {course.tagline}
          </p>
          <p className="mt-4 text-base sm:text-lg text-neutral-700 leading-relaxed max-w-3xl text-pretty">
            {course.shortDescription}
          </p>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-3xl">
            <Card>
              <CardContent className="p-3 sm:p-4">
                <CalendarDays className="size-5 text-primary mb-1.5" />
                <div className="text-[11px] sm:text-xs text-neutral-500 font-medium">Duration</div>
                <div className="mt-0.5 text-sm sm:text-base font-bold text-neutral-900">{course.duration}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <Clock className="size-5 text-primary mb-1.5" />
                <div className="text-[11px] sm:text-xs text-neutral-500 font-medium">Class Timing</div>
                <div className="mt-0.5 text-sm sm:text-base font-bold text-neutral-900 leading-tight">{course.timing.split(" / ")[0]}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <MapPin className="size-5 text-primary mb-1.5" />
                <div className="text-[11px] sm:text-xs text-neutral-500 font-medium">Learning Mode</div>
                <div className="mt-0.5 text-sm sm:text-base font-bold text-neutral-900 leading-tight">{course.learningMode.split(" / ").slice(0, 2).join("/")}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4">
                <RefreshCw className="size-5 text-primary mb-1.5" />
                <div className="text-[11px] sm:text-xs text-neutral-500 font-medium">
                  {seats.nextBatch ? "Next batch" : "New Batch"}
                </div>
                <div className="mt-0.5 text-sm sm:text-base font-bold text-neutral-900 leading-tight">
                  {seats.nextBatch?.name ?? course.newBatch}
                </div>
                {seats.openBatchCount > 0 && (
                  <div
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold",
                      seats.seatsLeftTotal > 0 ? "text-primary" : "text-neutral-500"
                    )}
                  >
                    <Users className="size-3.5" />
                    {seats.seatsLeftTotal > 0
                      ? `Seats left: ${seats.seatsLeftTotal}`
                      : "Full — join the waiting list"}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2 space-y-8">
              <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 aspect-[16/9]">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" aria-hidden="true">
                  <GraduationCap className="size-20 text-primary/30" />
                </div>
                <Image
                  src={course.image}
                  alt={course.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-cover bg-neutral-100"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/10 pointer-events-none" aria-hidden="true" />
              </div>

              <Tabs defaultValue="overview">
                <TabsList className="flex w-full overflow-x-auto no-scrollbar gap-2 snap-x snap-mandatory sm:w-auto sm:grid sm:grid-cols-4 sm:overflow-visible sm:gap-0">
                  <TabsTrigger value="overview" className="snap-start shrink-0 whitespace-nowrap">Overview</TabsTrigger>
                  <TabsTrigger value="skills" className="snap-start shrink-0 whitespace-nowrap">Skills &amp; Tools</TabsTrigger>
                  <TabsTrigger value="portfolio" className="snap-start shrink-0 whitespace-nowrap">Portfolio &amp; Career</TabsTrigger>
                  <TabsTrigger value="fees" className="snap-start shrink-0 whitespace-nowrap">Batches &amp; Enrollment</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <article className="prose prose-neutral max-w-none">
                    <h3 className="text-xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
                      <BookOpen className="size-5 text-primary" />
                      About this course
                    </h3>
                    {course.overview ? (
                      <>
                        <p className="text-neutral-700 leading-relaxed text-[15px] whitespace-pre-line">
                          {course.overview}
                        </p>
                        <Separator className="my-6" />
                      </>
                    ) : (
                      <>
                        <p className="text-neutral-700 leading-relaxed text-[15px] whitespace-pre-line">
                          {course.shortDescription} {course.tagline}
                        </p>
                        <Separator className="my-6" />
                      </>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-neutral-200 bg-white p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Award className="size-5 text-primary" />
                          <h4 className="text-sm font-semibold text-neutral-900">Credentials</h4>
                        </div>
                        <ul className="space-y-2 text-[15px]">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
                            <span className="text-neutral-700">
                              <strong>Institute Certificate:</strong> {course.instituteCertificate}
                            </span>
                          </li>
                          {course.industryCertification && (
                            <li className="flex items-start gap-2">
                              <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
                              <span className="text-neutral-700">
                                <strong>Industry Pathway:</strong> {course.industryCertification}
                              </span>
                            </li>
                          )}
                          {course.internship && (
                            <li className="flex items-start gap-2">
                              <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
                              <span className="text-neutral-700">
                                <strong>Internship:</strong> {course.internship}
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>

                      <div className="rounded-xl border border-neutral-200 bg-white p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="size-5 text-primary" />
                          <h4 className="text-sm font-semibold text-neutral-900">Ideal For</h4>
                        </div>
                        <p className="text-[15px] text-neutral-700 leading-relaxed mb-3">Designed for {course.targetStudents.toLowerCase()}.</p>
                        <div className="flex flex-wrap gap-1.5">
                          {course.targetStudents.split(", ").map((t) => (
                            <Badge key={t} variant="outline" className="text-xs">
                              {t.trim()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const hasObjectives = Array.isArray(course.learningObjectives) && course.learningObjectives.length > 0;
                      const hasPrerequisites = !!course.prerequisites;
                      if (!hasObjectives && !hasPrerequisites) return null;
                      return (
                        <>
                          <Separator className="my-6" />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {hasObjectives && (
                              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                                <div className="flex items-center gap-2 mb-3">
                                  <GraduationCap className="size-5 text-primary" />
                                  <h4 className="text-sm font-semibold text-neutral-900">Learning Objectives</h4>
                                </div>
                                <ul className="space-y-2 text-[15px]">
                                  {course.learningObjectives!.map((objective) => (
                                    <li key={objective} className="flex items-start gap-2">
                                      <CheckCircle2 className="size-4 text-accent mt-0.5 shrink-0" />
                                      <span className="text-neutral-700">{objective}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {hasPrerequisites && (
                              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                                <div className="flex items-center gap-2 mb-3">
                                  <BookOpen className="size-5 text-primary" />
                                  <h4 className="text-sm font-semibold text-neutral-900">Prerequisites</h4>
                                </div>
                                <p className="text-[15px] text-neutral-700 leading-relaxed whitespace-pre-line">
                                  {course.prerequisites}
                                </p>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    <Separator className="my-6" />

                    <h4 className="text-base font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                      <Sparkles className="size-5 text-secondary" />
                      Every Course Includes
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {everyCourseIncludes.map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-2 rounded-lg bg-neutral-50 border border-neutral-100 px-3 py-2.5 text-sm text-neutral-700"
                        >
                          <CheckCircle2 className="size-4 text-accent shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                </TabsContent>

                <TabsContent value="skills">
                  <div className="space-y-6">
                    <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="size-5 text-primary" />
                        <h3 className="text-lg font-semibold text-neutral-900">Skills You&apos;ll Gain</h3>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {course.skillsGained.slice(0, 6).map((skill) => (
                          <div
                            key={skill}
                            className="flex items-start gap-2.5 rounded-lg bg-neutral-50 p-3"
                          >
                            <CheckCircle2 className="size-4.5 text-accent mt-0.5 shrink-0" />
                            <span className="text-[15px] text-neutral-700 leading-relaxed">{skill}</span>
                          </div>
                        ))}
                        {course.skillsGained.length > 6 && (
                          <div className="flex items-start gap-2.5 rounded-lg bg-neutral-50 p-3">
                            <CheckCircle2 className="size-4.5 text-neutral-300 mt-0.5 shrink-0" />
                            <span className="text-[15px] font-medium text-neutral-600 leading-relaxed">
                              +{course.skillsGained.length - 6} more
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Wrench className="size-5 text-primary" />
                        <h3 className="text-lg font-semibold text-neutral-900">Software &amp; Tools</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {course.softwareTools.map((tool) => (
                          <Badge
                            key={tool}
                            variant="default"
                            className="px-3.5 py-1.5 text-sm font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15"
                          >
                            {tool}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="portfolio">
                  <div className="rounded-xl border border-neutral-200 bg-white p-5 sm:p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <FolderKanban className="size-5 text-primary" />
                      <h3 className="text-lg font-semibold text-neutral-900">
                        Projects &amp; Career Outcomes
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          Portfolio Projects
                        </div>
                        <div className="mt-3 space-y-2.5">
                          {course.portfolioProjects.map((project, i) => (
                            <div
                              key={project}
                              className="flex items-start gap-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3"
                            >
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-white text-[11px] font-bold">
                                {i + 1}
                              </span>
                              <div className="text-[15px] font-medium text-neutral-800 leading-relaxed">
                                {project}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          Career Opportunities
                        </div>
                        <div className="mt-3 space-y-2.5">
                          {course.careerOpportunities.map((role) => (
                            <div
                              key={role}
                              className="flex items-start gap-2.5 rounded-lg border border-neutral-100 bg-neutral-50 p-3"
                            >
                              <Briefcase className="size-4.5 text-secondary mt-0.5 shrink-0" />
                              <div className="text-[15px] font-medium text-neutral-800 leading-relaxed">
                                {role}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="fees">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                    <Card>
                      <CardContent className="p-6">
                        <CalendarDays className="size-6 text-primary mb-3" />
                        <div className="text-sm text-neutral-500 font-medium">Program Duration</div>
                        <div className="mt-1 text-3xl font-extrabold text-neutral-900">
                          {course.duration}
                        </div>
                        <p className="mt-2 text-sm text-neutral-600">
                          <Clock className="size-3.5 inline mr-1 -mt-0.5" />
                          {course.timing}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-6">
                        <RefreshCw className="size-6 text-primary mb-3" />
                        <div className="text-sm text-neutral-500 font-medium">Batch Schedule</div>
                        <div className="mt-1 text-2xl font-extrabold text-neutral-900">
                          {course.newBatch}
                        </div>
                        <p className="mt-2 text-sm text-neutral-600">
                          <MapPin className="size-3.5 inline mr-1 -mt-0.5" />
                          {course.learningMode}
                        </p>
                      </CardContent>
                    </Card>
                    {course.seats && (
                      <Card>
                        <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
                          <div className="flex items-center gap-3">
                            <Users className="size-6 text-secondary" />
                            <div>
                              <div className="text-sm text-neutral-500 font-medium">
                                Seats
                              </div>
                              <div className="font-semibold text-neutral-900">
                                {course.seats}
                              </div>
                            </div>
                          </div>
                          <Award className="size-6 text-neutral-300" />
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <aside className="lg:col-span-1">
              <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)] space-y-5">
                <Card className="shadow-md overflow-hidden">
                  <div className="h-1.5 gradient-primary w-full" />
                  <CardContent className="p-6 space-y-5">
                    <ul className="space-y-2.5 text-sm text-neutral-700">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-accent shrink-0" />
                        {course.instituteCertificate} on completion
                      </li>
                      {course.industryCertification && (
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-accent shrink-0" />
                          {course.industryCertification} pathway
                        </li>
                      )}
                      {course.internship && (
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="size-4 text-accent shrink-0" />
                          {course.internship}
                        </li>
                      )}
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-accent shrink-0" />
                        Small class sizes · Lab time included
                      </li>
                    </ul>
                    <div className="space-y-2.5 pt-1">
                      <Link
                        href={`/admissions/inquire?course=${encodeURIComponent(course.slug)}`}
                        className={cn(
                          buttonVariants({ size: "lg" }),
                          "w-full shadow-lg shadow-primary/20"
                        )}
                      >
                        {course.cta || "Get Batch Timing & Enrollment Details →"}
                        <ArrowRight className="size-4" />
                      </Link>
                      <CourseEnrollArea courseId={course.id} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </aside>
          </div>
        </Container>
      </section>

      {related.length > 0 && (
        <section className="py-14 sm:py-20 bg-neutral-50 border-t border-neutral-200">
          <Container size="xl">
            <SectionHeading
              eyebrow="Related Courses"
              title={`More in ${course.category}`}
              description="Students who viewed this course also explored these similar programs."
            />
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </Container>
        </section>
      )}
    </>
  );
}
