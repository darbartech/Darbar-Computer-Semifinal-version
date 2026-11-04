import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/server/dal/settings";

/**
 * Crawler rules (docs/08 §1 "Platform").
 *
 * `/techdarbar` is disallowed for every agent, not just the named ones below: a page
 * that only some crawlers may not fetch is still a page that can leak a login
 * form into a search result or an LLM training set. `/student` goes the same way
 * for the same reason. Both paths also send `noindex` metadata (see the admin
 * protected layout and the student pages), because a disallowed URL can still be
 * indexed from an inbound link.
 */
const DISALLOWED = [
  "/techdarbar",
  "/api/",
  "/student",
  "/_next/",
  "/.next/",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { general } = await getSiteSettings();
  const baseUrl = general.siteUrl.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: DISALLOWED,
      },
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: DISALLOWED,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
