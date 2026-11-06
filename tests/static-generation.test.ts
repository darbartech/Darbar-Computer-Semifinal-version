import { describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { safeStaticParams } from "@/lib/static-params";

/**
 * Build-time contract (task 4). Three things break a deploy that nothing else
 * notices until the site is live: a private route losing its `force-dynamic`
 * (a staff page rendered once at build is then served from cache to everyone),
 * a prerender list that dies with the database (the whole build fails instead of
 * falling back to on-demand generation), and a public marketing page that reads
 * the query string on the server (every visit renders, and the CDN caches
 * nothing). These checks read the source tree rather than the rendered HTML
 * because the failure they guard against happens in a build, not in a browser.
 */

const APP = join(process.cwd(), "src", "app");

/** `export const dynamic = "force-dynamic"` on this segment. */
function declaresForceDynamic(source: string): boolean {
  return /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/.test(source);
}

function routesIn(root: string): { file: string; route: string }[] {
  if (!existsSync(root)) throw new Error(`${relative(process.cwd(), root)} is gone`);
  const found: { file: string; route: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/(page|layout)\.tsx$/.test(entry)) continue;
      // Route groups and parallel routes hold pages but stay out of the URL.
      const segment = relative(root, dir)
        .split("\\")
        .filter((part) => !/^\(.*\)$/.test(part) && !part.startsWith("@"))
        .join("/");
      found.push({
        file: full,
        route: `/${entry === "layout.tsx" ? "" : segment}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
      });
    }
  };
  walk(root);
  return found;
}

/**
 * Every layout that wraps `file`, nearest first, up to and including the root
 * layout. A page inherits `force-dynamic` from any of them, which is how
 * `/techdarbar/**` and `/student/**` are kept out of the build today.
 */
function layoutChain(file: string): string[] {
  const chain: string[] = [];
  let dir = join(file, "..");
  while (dir.startsWith(APP)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) chain.push(layout);
    if (dir === APP) break;
    dir = join(dir, "..");
  }
  return chain;
}

const read = (file: string) => readFileSync(file, "utf8");

describe("private routes stay dynamic", () => {
  it("keeps every staff page behind force-dynamic", () => {
    const pages = routesIn(join(APP, "techdarbar"));
    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      const covered = [page.file, ...layoutChain(page.file)].some((file) =>
        declaresForceDynamic(read(file))
      );
      expect(covered, `${page.route} lost its force-dynamic flag`).toBe(true);
    }
  });

  it("keeps every student-portal page behind force-dynamic", () => {
    const pages = routesIn(join(APP, "(public)", "student"));
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      const covered = [page.file, ...layoutChain(page.file)].some((file) =>
        declaresForceDynamic(read(file))
      );
      expect(covered, `${page.route} lost its force-dynamic flag`).toBe(true);
    }
  });

  it("does not claim force-dynamic on the root layout", () => {
    // The root segment applies to every route in the app, including the public
    // marketing pages (re-audit #1).
    expect(declaresForceDynamic(read(join(APP, "layout.tsx")))).toBe(false);
  });
});

describe("public pages stay cacheable", () => {
  const staticPages = [
    join(APP, "(public)", "page.tsx"),
    join(APP, "(public)", "courses", "[slug]", "page.tsx"),
    join(APP, "(public)", "blog", "[slug]", "page.tsx"),
  ];

  it.each(staticPages.map((file) => [file]))(
    "%s renders without a session",
    (file) => {
      expect(declaresForceDynamic(read(file))).toBe(false);
    }
  );

  it("revalidates the public subtree instead of never refreshing it", () => {
    expect(read(join(APP, "(public)", "layout.tsx"))).toMatch(
      /export\s+const\s+revalidate\s*=\s*\d+/
    );
  });

  it("leaves the course catalog static by not reading the query string on the server", () => {
    const page = read(join(APP, "(public)", "courses", "page.tsx"));
    expect(page).not.toMatch(/searchParams/);
    // The filters still work: they are applied client-side from the URL.
    const client = read(join(APP, "(public)", "courses", "CoursesClient.tsx"));
    expect(client).toMatch(/useSearchParams\(\)/);
  });
});

describe("prerender lists survive a database that is not there", () => {
  const pagesWithParams = readdirSync(APP, { recursive: true })
    .map((entry) => join(APP, String(entry)))
    .filter((file) => /page\.tsx$/.test(file) && statSync(file).isFile())
    .filter((file) => read(file).includes("generateStaticParams"));

  it("finds the three detail routes that prerender", () => {
    expect(pagesWithParams.map((file) => relative(APP, file).split("\\").join("/")).sort()).toEqual(
      [
        join("(public)", "blog", "[slug]", "page.tsx"),
        join("(public)", "courses", "[slug]", "page.tsx"),
        join("(public)", "events", "[slug]", "page.tsx"),
      ]
        .map((parts) => parts.split("\\").join("/"))
        .sort()
    );
  });

  it("guards every one of them", () => {
    for (const file of pagesWithParams) {
      const source = read(file);
      expect(
        source.includes("safeStaticParams"),
        `${relative(process.cwd(), file)} builds a prerender list with no fallback`
      ).toBe(true);
    }
  });

  it("asks for slugs only, not a page of records", () => {
    expect(read(join(APP, "(public)", "blog", "[slug]", "page.tsx"))).toMatch(
      /safeStaticParams\(\s*["']\/blog\/\[slug\]["'],\s*listPublishedBlogSlugs\s*\)/
    );
    expect(read(join(APP, "(public)", "courses", "[slug]", "page.tsx"))).toMatch(
      /safeStaticParams\(\s*["']\/courses\/\[slug\]["'],\s*listPublishedCourseSlugs\s*\)/
    );
    expect(read(join(APP, "(public)", "events", "[slug]", "page.tsx"))).toMatch(
      /safeStaticParams\(\s*["']\/events\/\[slug\]["'],\s*listPublishedEventSlugs\s*\)/
    );
  });
});

describe("safeStaticParams", () => {
  it("passes the list through when the read works", async () => {
    await expect(
      safeStaticParams("/blog/[slug]", async () => [{ slug: "a" }, { slug: "b" }])
    ).resolves.toEqual([{ slug: "a" }, { slug: "b" }]);
  });

  it("trades a database that is not reachable for an empty list", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = async () => {
      throw new Error("Can't reach database server");
    };

    await expect(safeStaticParams("/blog/[slug]", failing)).resolves.toEqual([]);
    // The reason is logged, so a build without a database reads as that and not
    // as a broken page.
    expect(warn.mock.calls[0]?.[0]).toMatch(/\/blog\/\[slug\] skipped/);
    expect(warn.mock.calls[0]?.[1]).toBe("Can't reach database server");
    warn.mockRestore();
  });

  it("returns objects shaped as the route param, not records", async () => {
    const slugs = await safeStaticParams("/events/[slug]", async () => [{ slug: "fair" }]);
    expect(slugs).toEqual([{ slug: "fair" }]);
  });
});
