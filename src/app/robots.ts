import type { MetadataRoute } from "next";
import { getSiteSettings } from "@/server/dal/settings";

/**
 * Crawler rules (docs/08 §1 "Platform", fix guide §6).
 *
 * `/techdarbar` is disallowed for every agent, not just the named ones below: a
 * page that only some crawlers may not fetch is still a page that can leak a
 * login form into a search result or an LLM training set. `/student` goes the
 * same way for the same reason. Both paths also send `noindex` metadata (see the
 * admin protected layout and the student pages), because a disallowed URL can
 * still be indexed from an inbound link. The admin URL is not the protection —
 * auth and two-factor are.
 *
 * `/_next/` and `/.next/` are deliberately **not** listed. Disallowing them
 * blocks Googlebot from the CSS and JavaScript it needs to render a page, and a
 * crawler that cannot see the page ranks it worse or drops it. Build output has
 * nothing a crawler should be steered away from.
 *
 * One `*` rule already covers Googlebot and Yeti; three copies of the same list
 * only invite them to drift apart.
 */
const DISALLOWED = ["/api/", "/student", "/techdarbar"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { general } = await getSiteSettings();
  const baseUrl = general.siteUrl.replace(/\/$/, "");

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED }],
    sitemap: `${baseUrl}/sitemap.xml`,
    // No `host`: it is a non-standard directive Google ignores, and naming a
    // canonical host here while `alternates.canonical` already names it on every
    // page is one more place for the two to disagree.
  };
}
