"use client";
import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  SlidersHorizontal,
  CheckCircle2,
  Sparkles,
  FolderKanban,
  Users,
  Award,
  BookOpen,
  Briefcase,
  Layers,
  FileText,
  Bot,
} from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { CourseCard } from "@/components/sections/CourseCard";
import { Reveal } from "@/components/common/Reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/common/Badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Course } from "@/types/course";

/**
 * Catalog data arrives as props from the server page (docs/06 §3): a client
 * component may not import the DAL or `src/content/*`. The shared benefits list
 * is the `everyCourseIncludes` SiteSetting, passed in for the same reason.
 *
 * The filters are not props. This document is static, so the query string a
 * visitor arrived with is read here, after hydration, rather than by the page.
 */
export type CoursesClientProps = {
  courses: Course[];
  categoryGroups: { id: string; label: string; categories: string[] }[];
  everyCourseIncludes: string[];
};

const BENEFIT_ICONS: Record<string, React.ReactNode> = {
  "Live Projects": <Layers className="size-4" />,
  "Portfolio Building": <FolderKanban className="size-4" />,
  "Internship Support": <Briefcase className="size-4" />,
  "Job Interview Preparation": <Users className="size-4" />,
  "Career Counseling": <Award className="size-4" />,
  "LMS Access": <BookOpen className="size-4" />,
  "Lifetime Notes": <FileText className="size-4" />,
  "AI-Assisted Learning": <Bot className="size-4" />,
};

/**
 * The × that drops one active filter. Sized as a 24px target with a focus ring —
 * a 12px icon alone is impossible to hit on a phone and invisible to keyboard.
 */
function ChipRemove({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={label}
      className="-m-1 flex size-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <X className="size-3" />
    </button>
  );
}

function CoursesClientPage({
  courses,
  categoryGroups,
  everyCourseIncludes,
}: CoursesClientProps) {  const allCategoryGroups = React.useMemo(
    () => [{ id: "All", label: "All", categories: [] as string[] }, ...categoryGroups],
    [categoryGroups]
  );
  /** Level labels come from the DB rows; this map is only the display order. */
  const levelOrder = React.useMemo(
    () => new Map<string, number>([
      ["Beginner", 0],
      ["Beginner to Intermediate", 1],
      ["Intermediate", 2],
      ["Advanced", 3],
    ]),
    []
  );
  const allLevels = React.useMemo(
    () => ["All", ...new Set(courses.map((course) => course.level))],
    [courses]
  );

  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = React.useState("");
  const [categoryGroup, setCategoryGroup] = React.useState("All");
  const [level, setLevel] = React.useState("All");
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  /** The query string this component wrote last, so a URL event can be told
   *  from the one the typing itself caused. */
  const ownQuery = React.useRef<string | null>(null);

  const syncToUrl = React.useCallback(
    (nextSearch: string, nextCategoryGroup: string, nextLevel: string) => {
      const query = new URLSearchParams();
      if (nextSearch) query.set("search", nextSearch);
      if (nextCategoryGroup && nextCategoryGroup !== "All") query.set("category", nextCategoryGroup);
      if (nextLevel && nextLevel !== "All") query.set("level", nextLevel);
      const written = query.toString();
      const url = written ? `${pathname}?${written}` : pathname;
      ownQuery.current = written;
      router.replace(url, { scroll: false });
    },
    [router, pathname]
  );

  /**
   * A static document cannot see the query string at build time, so the filters
   * come from the URL after hydration: a bookmark, a link from the course JSON-LD
   * breadcrumb, or the back button all open the list they always did. The values
   * the component wrote itself are skipped, or a keystroke mid-debounce would be
   * pulled back to the query the previous keystroke produced.
   */
  React.useEffect(() => {
    const query = params.toString();
    if (query === ownQuery.current) return;
    ownQuery.current = query;
    setSearch(params.get("search") ?? "");
    setCategoryGroup(params.get("category") ?? "All");
    setLevel(params.get("level") ?? "All");
  }, [params]);

  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSearch = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      syncToUrl(value, categoryGroup, level);
    }, 350);
  };

  const updateCategoryGroup = (value: string) => {
    setCategoryGroup(value);
    syncToUrl(search, value, level);
  };

  const updateLevel = (value: string) => {
    setLevel(value);
    syncToUrl(search, categoryGroup, value);
  };

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const activeGroup =
      categoryGroup === "All"
        ? undefined
        : allCategoryGroups.find((g) => g.id === categoryGroup) ?? undefined;
    const activeGroupCategories = activeGroup?.categories as readonly string[] | undefined;

    const result = courses.filter((c) => {
      if (activeGroupCategories && !activeGroupCategories.includes(c.category)) return false;
      if (level !== "All" && c.level !== level) return false;
      if (q) {
        const haystack = [
          c.title,
          c.tagline,
          c.shortDescription,
          c.category,
          c.targetStudents,
          ...c.skillsGained,
          ...c.softwareTools,
          ...c.portfolioProjects,
          ...c.careerOpportunities,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    if (activeGroupCategories) {
      result.sort((a, b) => {
        const aLevel = levelOrder.get(a.level) ?? 99;
        const bLevel = levelOrder.get(b.level) ?? 99;
        if (aLevel !== bLevel) return aLevel - bLevel;
        return a.title.localeCompare(b.title);
      });
    }

    return result;
  }, [search, categoryGroup, level, courses, allCategoryGroups, levelOrder]);

  const hasActiveFilters = categoryGroup !== "All" || level !== "All" || search !== "";
  const activeFilterCount =
    (categoryGroup !== "All" ? 1 : 0) + (level !== "All" ? 1 : 0) + (search !== "" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setCategoryGroup("All");
    setLevel("All");
    syncToUrl("", "All", "All");
  };

  const activeCategoryGroupLabel =
    categoryGroup === "All"
      ? "All"
      : allCategoryGroups.find((g) => g.id === categoryGroup)?.label ?? categoryGroup;

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-12">
          <Breadcrumbs items={[{ label: "Courses" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Course Catalog"
            title={`Browse ${courses.length} Professional Courses`}
            description="From beginner computer literacy to flagship advanced career paths. Filter by category, level, or search by name, skill, or career outcome."
            className="mt-2"
          />
        </Container>

        <Container size="xl" className="pb-10">
          <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="size-5 text-secondary shrink-0" />
              <h3 className="font-semibold text-neutral-900">
                Every Course Includes
              </h3>
              <span className="text-xs text-neutral-500 hidden sm:inline">
                Standard benefits across all {courses.length} programs
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {everyCourseIncludes.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/70 backdrop-blur-sm px-3 py-2.5 text-sm text-neutral-700 shadow-sm"
                >
                  <div className="text-primary shrink-0 flex items-center justify-center">
                    {BENEFIT_ICONS[item] ?? <CheckCircle2 className="size-4" />}
                  </div>
                  <span className="font-medium leading-tight">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </div>

      <section className="py-8 sm:py-10">
        <Container size="xl">
          <div className="sticky top-[var(--header-h)] z-20 -mx-4 px-4 pb-4 bg-gradient-to-b from-background via-background to-transparent">
            <div className="rounded-xl border border-neutral-200 bg-white/95 backdrop-blur-sm shadow-sm">
              <div className="flex flex-col gap-3 p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                    <Input
                      type="search"
                      placeholder="Search by course, skill, tool, or career…"
                      value={search}
                      onChange={(e) => updateSearch(e.target.value)}
                      className="h-11 pl-10"
                      aria-label="Search courses"
                    />
                    {search && (
                        <button
                          type="button"
                          onClick={() => updateSearch("")}
                          aria-label="Clear search"
                          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                  </div>

                  <div className="hidden md:flex items-center gap-3">
                    <div className="w-[240px]">
                      <Select
                        value={level}
                        onChange={(e) => updateLevel(e.target.value)}
                        options={allLevels.map((l) => ({ value: l, label: l }))}
                      />
                    </div>
                    {hasActiveFilters && (
                      <Button variant="ghost" onClick={clearFilters} size="sm">
                        <X className="size-4" />
                        Clear
                      </Button>
                    )}
                  </div>

                  <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <SheetTrigger>
                      <Button variant="outline" className="md:hidden w-full relative">
                        <SlidersHorizontal className="size-4" />
                        Filters
                        {activeFilterCount > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                            {activeFilterCount}
                          </span>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl">
                      <SheetHeader>
                        <SheetTitle className="flex items-center justify-between">
                          <span>Course Filters</span>
                          {activeFilterCount > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-primary/10 text-xs font-bold text-primary">
                              {activeFilterCount} active
                            </span>
                          )}
                        </SheetTitle>
                      </SheetHeader>
                      <div className="p-4 pb-6 space-y-5 overflow-y-auto">
                        {hasActiveFilters && (
                          <div className="flex flex-wrap gap-1.5 p-3 rounded-xl bg-neutral-50 border border-neutral-100">
                            {categoryGroup !== "All" && (
                              <Badge variant="outline" className="gap-1.5 text-xs">
                                {activeCategoryGroupLabel}
                                <ChipRemove
                                  label={`Remove ${activeCategoryGroupLabel} filter`}
                                  onRemove={() => updateCategoryGroup("All")}
                                />
                              </Badge>
                            )}
                            {level !== "All" && (
                              <Badge variant="outline" className="gap-1.5 text-xs">
                                {level}
                                <ChipRemove
                                  label={`Remove ${level} filter`}
                                  onRemove={() => updateLevel("All")}
                                />
                              </Badge>
                            )}
                            {search !== "" && (
                              <Badge variant="outline" className="gap-1.5 text-xs max-w-[160px]">
                                <Search className="size-3 shrink-0" />
                                <span className="truncate">{search.slice(0, 16)}{search.length > 16 ? "…" : ""}</span>
                                <ChipRemove label="Clear search filter" onRemove={() => updateSearch("")} />
                              </Badge>
                            )}
                          </div>
                        )}
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-neutral-900">Category</label>
                          <div className="flex flex-wrap gap-2">
                            {allCategoryGroups.map((g) => (
                              <Button
                                key={g.id}
                                type="button"
                                variant={categoryGroup === g.id ? "default" : "outline"}
                                size="sm"
                                aria-pressed={categoryGroup === g.id}
                                className="h-10 rounded-full px-4"
                                onClick={() => updateCategoryGroup(g.id)}
                              >
                                {g.label}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-semibold text-neutral-900">Level</label>
                          <Select
                            value={level}
                            onChange={(e) => updateLevel(e.target.value)}
                            options={allLevels.map((l) => ({ value: l, label: l }))}
                          />
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-neutral-200 bg-white flex flex-col sm:flex-row gap-2.5">
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              clearFilters();
                            }}
                            className="w-full sm:w-auto h-12"
                          >
                            <X className="size-4" />
                            Clear All
                          </Button>
                        )}
                        <Button
                          onClick={() => setFiltersOpen(false)}
                          className={`flex-1 h-12 ${!hasActiveFilters ? "sm:w-full" : ""}`}
                        >
                          <CheckCircle2 className="size-4" />
                          Show {filtered.length} Results
                        </Button>
                      </div>
                    </SheetContent>
                  </Sheet>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
            {allCategoryGroups.map((g) => (
              <Button
                key={g.id}
                type="button"
                variant={categoryGroup === g.id ? "secondary" : "outline"}
                size="sm"
                aria-pressed={categoryGroup === g.id}
                className="h-9 rounded-full px-4"
                onClick={() => updateCategoryGroup(g.id)}
              >
                {g.label}
              </Button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              Showing{" "}
              <span className="font-semibold text-neutral-900">{filtered.length}</span> of{" "}
              {courses.length} courses
            </p>
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-1.5">
                {categoryGroup !== "All" && (
                  <Badge variant="outline" className="gap-1.5">
                    {activeCategoryGroupLabel}
                    <ChipRemove
                      label={`Remove ${activeCategoryGroupLabel} filter`}
                      onRemove={() => updateCategoryGroup("All")}
                    />
                  </Badge>
                )}
                {level !== "All" && (
                  <Badge variant="outline" className="gap-1.5">
                    {level}
                    <ChipRemove
                      label={`Remove ${level} filter`}
                      onRemove={() => updateLevel("All")}
                    />
                  </Badge>
                )}
              </div>
            )}
          </div>
        </Container>
      </section>

      <section className="pb-20">
        <Container size="xl">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-12 sm:p-16 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
                <Search className="size-7" />
              </div>
              <h3 className="text-xl font-semibold text-neutral-900">No courses found</h3>
              <p className="mt-2 text-neutral-600 max-w-md mx-auto leading-relaxed">
                Try clearing some filters or search with a different keyword (try &ldquo;Python&rdquo;, &ldquo;design&rdquo;, or &ldquo;freelancing&rdquo;).
              </p>
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button onClick={clearFilters}>Clear Filters</Button>
                <Link href="/courses" className={cn(buttonVariants({ variant: "outline" }))}>
                  Show All Courses
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((course, i) => (
                <Reveal key={course.id} delay={Math.min(i * 70, 350)} y={18}>
                  <CourseCard course={course} />
                </Reveal>
              ))}
            </div>
          )}
        </Container>
      </section>
    </>
  );
}

export default function CoursesClient(props: CoursesClientProps) {
  return (
    <Suspense fallback={
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-neutral-500">Loading course catalog...</div>
      </div>
    }>
      <CoursesClientPage {...props} />
    </Suspense>
  );
}
