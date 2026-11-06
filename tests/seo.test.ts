import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { buildMetadata } from "@/lib/seo";
import type { SiteSettingsView } from "@/lib/settings-view";

/**
 * SEO contract (task 7). Two of these are unit tests of `buildMetadata`; the
 * rest read the source tree, because the regressions being guarded are missing
 * declarations — a page that quietly loses its `canonical`, an admin URL that
 * starts advertising itself as indexable, a sitemap that tells every crawler the
 * whole site changed today. None of them fail a build, and none of them are
 * visible until a search result is wrong.
 */

const APP = join(process.cwd(), "src", "app");
const read = (file: string) => readFileSync(file, "utf8");

/** The prose out of a source file, so a docblock cannot satisfy a check. */
function code(source: string): string {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("//") && !line.startsWith("*") && !line.startsWith("/*"))
    .join("\n");
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
      if (!/page\.tsx$/.test(entry)) continue;
      const segment = relative(root, dir)
        .split("\\")
        .filter((part) => !/^\(.*\)$/.test(part) && !part.startsWith("@"))
        .join("/");
      found.push({
        file: full,
        route: `/${segment}`.replace(/\/+/g, "/").replace(/\/$/, "") || "/",
      });
    }
  };
  walk(root);
  return found;
}

/** Every layout that wraps `file`, nearest first, up to and including the root layout. */
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

const saysNoindex = (source: string) => /NOINDEX_METADATA|index:\s*false/.test(source);

describe("buildMetadata", () => {
  let siteUrl: string | undefined;

  beforeAll(() => {
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    // Trailing slash on purpose: the canonical must not grow a `//courses`.
    process.env.NEXT_PUBLIC_SITE_URL = "https://darbar.example/";
  });

  afterAll(() => {
    if (siteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = siteUrl;
  });

  it("points each page at its own URL", () => {
    const metadata = buildMetadata({ title: "Courses", path: "/courses" });
    expect(metadata.alternates?.canonical).toBe("https://darbar.example/courses");
    expect(metadata.openGraph?.url).toBe("https://darbar.example/courses");
  });

  it("emits no keyword list", () => {
    // Google says it ignores them, and a boilerplate list on every page is what
    // manipulative metadata looks like.
    expect(buildMetadata({ title: "Home", path: "/" }).keywords).toBeUndefined();
  });

  it("still lets a page declare real topic keywords", () => {
    const metadata = buildMetadata({
      title: "Web Development",
      path: "/courses/web-development",
      keywords: ["html", "css"],
    });
    expect(metadata.keywords).toEqual(["html", "css"]);
  });

  it("takes the canonical from the live settings, not from an override", () => {
    // `buildMetadata` composes the URL after spreading the overrides precisely so
    // that a hand-written `localhost` canonical cannot survive into production.
    const settings = {
      general: { siteUrl: "https://darbar.example", name: "DarbarTech", description: "An institute." },
    } as unknown as SiteSettingsView;

    const metadata = buildMetadata(
      {
        title: "About",
        path: "/about",
        alternates: { canonical: "http://localhost:3000/about" },
      },
      settings
    );
    expect(metadata.alternates?.canonical).toBe("https://darbar.example/about");
    expect(metadata.openGraph?.url).toBe("https://darbar.example/about");
  });
});

describe("public pages", () => {
  const publicPages = routesIn(join(APP, "(public)")).filter(
    // The student subtree is not public content: it is the portal and the
    // account forms, and it is checked for `noindex` instead.
    (page) => !relative(join(APP, "(public)"), page.file).startsWith(join("student"))
  );

  it("every indexable page names its own canonical path", () => {
    expect(publicPages.length).toBeGreaterThan(10);
    for (const page of publicPages) {
      const source = read(page.file);
      // `buildMetadata` is the only producer of metadata here, and it can only
      // build a canonical from the `path` it is handed — a page that forgets the
      // argument claims to be a duplicate of the home page.
      expect(source, `${page.route} has no metadata builder`).toContain("buildMetadata(");
      expect(source, `${page.route} builds metadata without a path`).toMatch(/path:/);
    }
  });

  it("is not given a site-wide canonical or keyword list by the root layout", () => {
    const layout = read(join(APP, "layout.tsx"));
    expect(layout).not.toMatch(/alternates\s*:/);
    expect(layout).not.toMatch(/keywords\s*:/);
  });
});

describe("private pages", () => {
  const roots = ["techdarbar", "verify", join("(public)", "student")];
  const pages = roots.flatMap((root) => routesIn(join(APP, ...root.split("\\"))));

  it("sends noindex, through the page or through its layout", () => {
    expect(pages.length).toBeGreaterThan(20);
    for (const page of pages) {
      const covered = [page.file, ...layoutChain(page.file)].some((file) =>
        saysNoindex(read(file))
      );
      expect(covered, `${relative(APP, page.file)} can be indexed`).toBe(true);
    }
  });

  it("is absent from the sitemap", () => {
    const sitemap = code(read(join(APP, "sitemap.ts")));
    for (const path of ["/student", "/techdarbar", "/verify"]) {
      expect(sitemap, `${path} is listed in the sitemap`).not.toContain(path);
    }
  });
});

describe("robots.txt", () => {
  const source = read(join(APP, "robots.ts"));

  it("disallows the private areas", () => {
    for (const path of ["/api/", "/student", "/techdarbar"]) {
      expect(source).toContain(`"${path}"`);
    }
    // `/verify` is deliberately not disallowed: the QR code printed on a
    // certificate has to be fetchable. It sends `noindex` instead, which is why
    // the sitemap check above covers it.
    expect(code(source)).not.toContain("/verify");
  });

  it("does not name a canonical host", () => {
    // A non-standard directive Google ignores, and one more place for the
    // canonical origin to be wrong.
    expect(code(source)).not.toMatch(/\bhost\s*:/);
  });
});

describe("sitemap freshness", () => {
  const source = read(join(APP, "sitemap.ts"));

  it("has no `new Date()` lastmod", () => {
    // A `lastmod` that is always "today" trains crawlers to ignore `lastmod`.
    expect(code(source)).not.toMatch(/new Date\(/);
  });

  it("dates only records, and dates them from the record", () => {
    const dated = [...source.matchAll(/lastModified:\s*([^\n,]+),/g)];
    expect(dated.length).toBeGreaterThan(0);
    for (const [, value] of dated) {
      expect(value.trim(), `lastmod is not an updatedAt: ${value}`).toMatch(/\.updatedAt$/);
    }
  });

  it("reads the uncapped slug lists, not a page of records", () => {
    for (const fn of [
      "listPublishedCourseSlugs",
      "listPublishedBlogSlugs",
      "listPublishedEventSlugs",
    ]) {
      expect(source).toContain(`${fn}()`);
    }
  });
});

describe("seed imagery", () => {
  it("does not put the site behind a stock-photo host", () => {
    // Each of these hosts is a CSP `img-src` entry and an image-optimizer origin;
    // the pictures live in `/public/images/seed` now, so neither list names them.
    for (const file of [join(APP, "..", "lib", "csp.ts"), join(process.cwd(), "next.config.mjs")]) {
      const source = code(read(file));
      for (const host of [
        "images.pexels.com",
        "images.unsplash.com",
        "cdn.prod.website-files.com",
      ]) {
        expect(source, `${host} is still referenced by ${relative(process.cwd(), file)}`).not.toContain(
          host
        );
      }
    }
  });
});
