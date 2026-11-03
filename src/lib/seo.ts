import type { Metadata } from "next";
import { SITE_CONFIG } from "./constants";
import { resolveSiteSettings, type SiteSettingsView } from "@/lib/settings-view";
import type { Course } from "@/types/course";
import type { BlogPostFrontmatter } from "@/types/blog-post";

/**
 * Metadata and JSON-LD builders (docs/04 §4.1: "SEO defaults, JSON-LD").
 *
 * Every function takes the resolved site settings. Passing them in keeps this
 * module free of Prisma and `server-only`, so it stays usable from anywhere;
 * pages that have not been switched to the DAL yet call it without arguments and
 * get the same values the static site used to hard-code (`SITE_CONFIG` /
 * `prisma/seed-data/site-settings.ts`), because those are the fallback layer of
 * the resolver (docs/07 §1).
 */

/** Fallback settings: literals + `NEXT_PUBLIC_*`, no database access. */
export function fallbackSettings(): SiteSettingsView {
  return resolveSiteSettings([], {}, process.env);
}

/**
 * `noindex, nofollow` for surfaces that must never be indexed: `/admin`,
 * `/admin/login` and `/student/*` (docs/08 §1 "Platform").
 *
 * Shared so every one of those routes emits byte-identical directives — a
 * half-configured robots block is the usual reason an admin URL still shows up
 * in a search result.
 */
export const NOINDEX_METADATA: Metadata["robots"] = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

/** `/opengraph-image` is the app-router social card route. */
const DEFAULT_OG_IMAGE = SITE_CONFIG.ogImage;

/**
 * Serializes structured data for a `<script type="application/ld+json">` tag.
 *
 * `JSON.stringify` alone is unsafe here: an admin-editable string containing
 * `</script>` would close the tag and inject markup. Escaping `<` (plus the JS
 * line separators) keeps the payload inert while remaining valid JSON.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildMetadata(
  overrides: Partial<Metadata> & { title: string; description?: string; path?: string; images?: string[] },
  settings?: SiteSettingsView
): Metadata {
  const site = settings ?? fallbackSettings();
  const { general } = site;

  // `path` and `images` are buildMetadata conveniences, not `Metadata` fields.
  const { path, images: imageOverrides, ...rest } = overrides;

  const url = `${general.siteUrl}${path ?? ""}`;
  const description = overrides.description ?? general.description;
  const fullTitle = `${overrides.title} | ${general.name}`;
  const images = imageOverrides ?? [general.logoUrl ?? DEFAULT_OG_IMAGE];
  const twitterCreator = general.twitterHandle || SITE_CONFIG.twitter.handle;

  return {
    keywords: [
      "computer training",
      "computer institute Nepal",
      "programming courses",
      "DarbarTech",
      "IT training Kathmandu",
    ],
    authors: [{ name: general.name, url: general.siteUrl }],
    creator: general.name,
    publisher: general.name,
    applicationName: general.name,
    ...rest,
    // Applied after the spread: these must always reflect the live settings, so a
    // stale override can never point canonical URLs at the localhost fallback.
    metadataBase: new URL(general.siteUrl),
    alternates: { ...(rest.alternates as Metadata["alternates"]), canonical: url },
    openGraph: {
      ...(rest.openGraph as Metadata["openGraph"]),
      type: "website",
      url,
      title: fullTitle,
      description,
      siteName: general.name,
      locale: SITE_CONFIG.locale,
      images,
    },
    twitter: {
      ...(rest.twitter as Metadata["twitter"]),
      card: "summary_large_image",
      title: fullTitle,
      description,
      images,
      creator: twitterCreator,
      site: twitterCreator,
    },
    title: overrides.title,
    description,
  };
}

export function courseJsonLd(course: Course, settings?: SiteSettingsView) {
  const site = settings ?? fallbackSettings();
  const weeksMatch = course.duration.match(/(\d+)/);
  const weeks = weeksMatch ? parseInt(weeksMatch[1], 10) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.title,
    description: course.shortDescription,
    provider: {
      "@type": "EducationalOrganization",
      name: site.general.name,
      address: site.contact.address,
    },
    numberOfCredits: weeks,
    courseCode: course.slug,
    educationalLevel: course.level,
    coursePrerequisites: course.targetStudents,
    skill: course.skillsGained.join(", "),
    instructorCredential: course.instituteCertificate,
    hasCourseInstance: {
      "@type": "CourseInstance",
      courseMode: course.learningMode.includes("Physical") ? "InPerson" : "Online",
      duration: weeks ? `P${weeks}W` : undefined,
    },
  };
}

export function orgJsonLd(settings?: SiteSettingsView) {
  const site = settings ?? fallbackSettings();
  return {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: site.general.name,
    description: site.general.description,
    url: site.general.siteUrl,
    telephone: site.contact.phone,
    email: site.contact.email,
    address: site.contact.address,
  };
}

export function blogPostJsonLd(post: BlogPostFrontmatter, settings?: SiteSettingsView) {
  const site = settings ?? fallbackSettings();
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Person", name: post.author },
    image: post.cover,
    keywords: post.tags?.join(", "),
    publisher: {
      "@type": "EducationalOrganization",
      name: site.general.name,
    },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function breadcrumbListJsonLd(items: { name: string; item?: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.item ? { item: it.item } : {}),
    })),
  };
}

export function websiteJsonLd(settings?: SiteSettingsView) {
  const site = settings ?? fallbackSettings();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: site.general.name,
    url: site.general.siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${site.general.siteUrl}/courses?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
