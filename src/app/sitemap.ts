import type { MetadataRoute } from "next";
import { listPublishedCourseSlugs } from "@/server/dal/courses";
import { getSiteSettings } from "@/server/dal/settings";
import { listPublishedBlogPosts } from "@/server/dal/blog";
import { listPublishedEvents } from "@/server/dal/events";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The base URL is the `general.siteUrl` setting, so an editor can fix the
  // canonical domain from the admin without a redeploy.
  const { general } = await getSiteSettings();
  const baseUrl = general.siteUrl.replace(/\/$/, "");
  const now = new Date();
  // Archived and draft courses must never appear in the sitemap (docs/06 §7).
  const publishedCourses = await listPublishedCourseSlugs();
  const blogPosts = await listPublishedBlogPosts();
  const eventEntries = await listPublishedEvents();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/courses`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/gallery`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/events`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/how-it-works`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/admissions/inquire`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // `/student/login`, `/student/register` and everything under `/admin` are
    // deliberately absent: those routes send `noindex` and are disallowed in
    // robots.ts (docs/08 §1). A noindex URL listed in the sitemap is a
    // contradictory signal.
  ];

  const courseRoutes: MetadataRoute.Sitemap = publishedCourses.map((course) => ({
    url: `${baseUrl}/courses/${course.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt ?? post.createdAt),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // Event detail pages, one URL per event. Pointing every event at the bare
  // `/events` listing produced five identical entries and left all five detail
  // pages out of the sitemap.
  const eventRoutes: MetadataRoute.Sitemap = eventEntries.map((event) => ({
    url: `${baseUrl}/events/${event.slug}`,
    lastModified: new Date(event.startsAt),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...courseRoutes, ...blogRoutes, ...eventRoutes];
}
