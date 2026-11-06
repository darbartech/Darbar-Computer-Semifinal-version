import type { MetadataRoute } from "next";
import { listPublishedCourseSlugs } from "@/server/dal/courses";
import { getSiteSettings } from "@/server/dal/settings";
import { listPublishedBlogSlugs } from "@/server/dal/blog";
import { listPublishedEventSlugs } from "@/server/dal/events";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The base URL is the `general.siteUrl` setting, so an editor can fix the
  // canonical domain from the admin without a redeploy.
  const { general } = await getSiteSettings();
  const baseUrl = general.siteUrl.replace(/\/$/, "");
  // Archived and draft courses must never appear in the sitemap (docs/06 §7).
  // These are the uncapped prerender reads, not the page lists: a sitemap that
  // quietly stops at `PUBLIC_LIST_LIMIT` records is worse than one with no
  // `lastmod` at all.
  const publishedCourses = await listPublishedCourseSlugs();
  const blogPosts = await listPublishedBlogSlugs();
  const eventEntries = await listPublishedEventSlugs();

  // Marketing pages have no record to take a date from, so they carry none.
  // `new Date()` used to sit on every one of them, which told a crawler the
  // whole site changed hourly — a `lastmod` that is always "today" is a `lastmod`
  // that is never believed.
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/courses`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/gallery`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/events`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/how-it-works`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/faq`,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/admissions/inquire`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // `/student/login`, `/student/register` and everything under `/techdarbar` are
    // deliberately absent: those routes send `noindex` and are disallowed in
    // robots.ts (docs/08 §1). A noindex URL listed in the sitemap is a
    // contradictory signal.
  ];

  const courseRoutes: MetadataRoute.Sitemap = publishedCourses.map((course) => ({
    url: `${baseUrl}/courses/${course.slug}`,
    lastModified: course.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: post.updatedAt,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Event detail pages, one URL per event. Pointing every event at the bare
  // `/events` listing produced five identical entries and left all five detail
  // pages out of the sitemap.
  const eventRoutes: MetadataRoute.Sitemap = eventEntries.map((event) => ({
    url: `${baseUrl}/events/${event.slug}`,
    lastModified: event.updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...courseRoutes, ...blogRoutes, ...eventRoutes];
}
