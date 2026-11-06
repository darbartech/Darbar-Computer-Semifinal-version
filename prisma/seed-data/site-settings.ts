import type {
  AboutSettings,
  ContactSettings,
  FacilitiesSettings,
  FeesSettings,
  GeneralSettings,
  HeroSettings,
  HoursSettings,
  RetentionSettings,
  SocialsSettings,
  StatsSettings,
  WhyChooseUsSettings,
} from "../../src/lib/validators/settings";

/**
 * Baseline `SiteSetting` rows (docs/03 §4, docs/07 §1).
 *
 * These literals are a verbatim copy of what the static site renders today
 * (`prisma/seed-data/institute.ts` + `SITE_CONFIG` in `src/lib/constants.ts`). Two
 * reasons they are copies rather than imports:
 *
 * 1. docs/04 Phase 4 "Definition of Done": once a module is migrated, the public
 *    runtime must not import `src/content/*`. The DAL uses this file as the
 *    innermost fallback, so importing the content module would defeat the cutover.
 * 2. docs/07 §1: seed data in `prisma/seed-data/` is the disaster-recovery
 *    baseline and must stay readable after `src/content/` is deleted.
 *
 * `scripts/verify-seed.ts` compares what comes back out of the database against
 * these same literals, so drift after a re-seed is detected.
 */

/** Stock campus photo used until an editor uploads a real one (docs/07 §1). */
export const PLACEHOLDER_CAMPUS_IMAGE =
  "/images/seed/pexels-10127241.jpg";

/** Home page hero artwork, until an editor uploads a real image. */
export const HERO_IMAGE_FALLBACK =
  "/images/seed/template-64539e138771820ebcb7619d_hero-image.png";

/** Home page hero pop-up artwork, until an editor uploads a real image. */
export const HERO_POPUP_IMAGE_FALLBACK =
  "/images/seed/template-6451ec7f19901e54999d5d0c_hero-popup-image-2.png";

/** Media folder for the images referenced by the settings keys. */
export const SETTINGS_MEDIA_FOLDER = "site";

/** Fallback `siteUrl` matches the static `SITE_CONFIG.url` default exactly. */
const DEFAULT_SITE_URL = "http://localhost:3001";

const general: GeneralSettings = {
  name: "DarbarTech",
  shortName: "DarbarTech",
  tagline: "GROUP OF TECHNOLOGY",
  description:
    "DarbarTech Group of Technology — Kathmandu's hands-on computer training institute. 37 career-focused courses across 15 fields: programming, web development, AI engineering, design, networking, digital marketing, and more. Certified trainers, small batches, real lab time, and career support.",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL,
  logoMediaId: null,
  twitterHandle: "@darbarcomputer",
};

/**
 * Home page hero copy (docs/03 §4). `title` and `eyebrow` use `**word**` to mark
 * the highlighted phrase; `title` uses `\n` to control line breaks. Mirrors the
 * copy previously hardcoded in `src/components/sections/Hero.tsx`.
 */
const hero: HeroSettings = {
  eyebrow: "37 Career-Focused **Courses** · Certified Trainers",
  title: "Learn the Digital\nSkills That **Actually**\nGet You Hired.",
  subtitle:
    "DarbarTech’s hands-on training turns beginners into job-ready professionals. Small batches, flexible morning-to-evening timings, and trainers with real industry experience.",
  primaryCtaLabel: "Browse Courses",
  primaryCtaHref: "/courses",
  secondaryCtaLabel: "",
  secondaryCtaHref: "",
  imageMediaId: null,
  imageAlt: "Trainer guiding students at a DarbarTech computer lab",
  popupMediaId: null,
  popupAlt: "DarbarTech students working together",
};

const contact: ContactSettings = {
  phone: "+977-9760808629",
  whatsapp: "+977-9760808629",
  email: "info@darbarcomputer.edu.np",
  address: "Kathmandu, Nepal",
  mapQuery: "Kathmandu, Nepal",
  notifyEmail: "",
};

const hours: HoursSettings = [
  { day: "Sunday – Friday", time: "7:00 AM – 8:00 PM" },
  { day: "Saturday", time: "8:00 AM – 6:00 PM" },
  { day: "Public Holidays", time: "Closed (except pre-announced events)" },
];

const socials: SocialsSettings = [
  { name: "Facebook", url: "https://facebook.com/darbarcomputer", icon: "facebook" },
  { name: "Instagram", url: "https://instagram.com/darbarcomputer", icon: "instagram" },
  { name: "YouTube", url: "https://youtube.com/@darbarcomputer", icon: "youtube" },
  { name: "LinkedIn", url: "https://linkedin.com/company/darbarcomputer", icon: "linkedin" },
];

/**
 * `campusMediaId` is filled in by the seed with the `Media` row for
 * `PLACEHOLDER_CAMPUS_IMAGE`, so the about page keeps rendering the same photo.
 */
const about: AboutSettings = {
  story:
    "DarbarTech Group of Technology started with a simple observation: Nepal has no shortage of talented, motivated people — what it has been short on is affordable, practical, hands-on training that actually prepares someone for a job or a freelance career on day one. From a foundation in basic computer literacy, typing, and office skills, DarbarTech has grown its course catalog to cover 15 career fields, from web development and AI engineering to graphic design, networking, and digital marketing — always built around the same philosophy: less lecture, more lab.",
  mission:
    "To empower every student with practical, job-ready digital skills through high-quality, affordable, and hands-on computer training — and to support them in their first career step after graduation.",
  vision:
    "To be the most trusted computer training institute in the region, known for producing skilled, ethical, and career-ready professionals in every field of information technology.",
  campusMediaId: null,
};

/**
 * Unverified figures keep their `isPlaceholder` flag (docs/07 §1: "kept but
 * flagged so the admin warns"). Only "Courses Offered: 37" is verified, because it
 * is derived from the catalog itself.
 */
const stats: StatsSettings = [
  { label: "Years of Training Excellence", value: "10+", isPlaceholder: true },
  { label: "Students Trained", value: "15+", isPlaceholder: true },
  { label: "Courses Offered", value: "37", isPlaceholder: false },
  {
    label: "Certification Rate",
    value: "On-Time Completion Focused",
    isPlaceholder: true,
  },
];

const whyChooseUs: WhyChooseUsSettings = [
  {
    title: "Certified, Industry-Experienced Trainers",
    description:
      "Not lecturers reading slides, but practitioners who've built the software, run the ad campaigns, or configured the networks they teach.",
    icon: "award",
  },
  {
    title: "Dedicated Hands-On Lab Access",
    description:
      "Dedicated, fully equipped computer labs with real practice time in every single session, not just theory hours.",
    icon: "monitor",
  },
  {
    title: "Career Support After Graduation",
    description:
      "Portfolio building, resume help, interview prep, and introductions through our hiring-partner network for eligible programs.",
    icon: "briefcase",
  },
  {
    title: "Batches That Fit Real Life",
    description:
      "Morning, day, and evening timings designed for students, job-seekers, and working professionals alike.",
    icon: "clock",
  },
  {
    title: "Small Class Sizes",
    description:
      "Intentionally kept small (8–15 students) so trainers can actually notice when you're stuck and give you individual time.",
    icon: "users",
  },
  {
    title: "Installments Available",
    description:
      "Flexible installment plans available so course fees and schedule don't become a barrier to your goals.",
    icon: "wallet",
  },
];

const facilities: FacilitiesSettings = [
  "Fully-equipped computer labs with modern PCs",
  "High-speed Wi-Fi throughout the campus",
  "Dedicated project studio for design/video students",
  "Hardware lab for hands-on assembly and networking practice",
  "Student library with course reference books",
  "Counseling room for one-on-one career guidance",
];

const everyCourseIncludes: string[] = [
  "Live Projects",
  "Portfolio Building",
  "Internship Support",
  "Job Interview Preparation",
  "Career Counseling",
  "LMS Access",
  "Lifetime Notes",
  "AI-Assisted Learning",
];

/**
 * Fees rules (docs 05 §7). Unlike the ten content keys above, there is no static
 * predecessor to copy: these are the documented starting values, and the discount
 * threshold is the only one that gates a write. `bankDetails` starts empty rather
 * than with a plausible-looking account number.
 */
const fees: FeesSettings = {
  currency: "NPR",
  discountApprovalThresholdPct: 10,
  lateFeePerWeek: 0,
  certificateRequiresClearance: false,
  allowedDueAmount: 0,
  maxBackdateDays: 3,
  bankDetails: "",
  receiptFooter: "",
};

/**
 * Retention windows (docs/08 §1). An enquiry that went nowhere and a message
 * nobody needed for a year are the two rows on this site that hold a stranger's
 * name, phone number and words — so the baseline keeps them for the period the
 * institute can defend (two years of marketing history, one year of postbag) and
 * no longer. The `retention` cron job is the only reader.
 */
const retention: RetentionSettings = {
  leadMonths: 24,
  messageMonths: 12,
};

export const SETTING_DEFAULTS = {
  general,
  hero,
  contact,
  hours,
  socials,
  about,
  stats,
  whyChooseUs,
  facilities,
  everyCourseIncludes,
  fees,
  retention,
} as const;

export type SettingDefaults = typeof SETTING_DEFAULTS;
