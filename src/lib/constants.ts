export const SITE_CONFIG = {
  name: "DarbarTech",
  shortName: "DarbarTech",
  tagline: "GROUP OF TECHNOLOGY",
  description: "DarbarTech Group of Technology — Kathmandu's hands-on computer training institute. 37 career-focused courses across 15 fields: programming, web development, AI engineering, design, networking, digital marketing, and more. Certified trainers, small batches, real lab time, and career support.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  locale: "en",
  phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "+977-1-4000000",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "info@darbartech.edu.np",
  address: process.env.NEXT_PUBLIC_ADDRESS || "Kathmandu, Nepal",
  ogImage: "/opengraph-image.png",
  twitter: {
    handle: "@darbarcomputer",
    site: "@darbarcomputer",
  },
} as const;

export const COURSE_CATEGORIES = [
  "Basic Computer",
  "Office & Productivity",
  "Programming",
  "Web Development",
  "AI & Automation",
  "Data Science",
  "Cloud & DevOps",
  "Graphic Design",
  "Video Production",
  "Business & Accounting",
  "Networking",
  "Cyber Security",
  "Digital Marketing",
  "Career Programs",
  "Professional Diploma",
] as const;

export const COURSE_CATEGORY_GROUPS = [
  {
    id: "basic-computer",
    label: "Basic Computer",
    categories: ["Basic Computer", "Office & Productivity"],
  },
  {
    id: "programming",
    label: "Programming",
    categories: ["Programming", "Web Development", "AI & Automation", "Cloud & DevOps"],
  },
  {
    id: "data-science",
    label: "Data Science",
    categories: ["Data Science"],
  },
  {
    id: "graphics-design",
    label: "Graphics Design",
    categories: ["Graphic Design", "Video Production"],
  },
  {
    id: "digital-marketing",
    label: "Digital Marketing",
    categories: ["Digital Marketing"],
  },
  {
    id: "special",
    label: "Special Programs",
    categories: [
      "Business & Accounting",
      "Networking",
      "Cyber Security",
      "Career Programs",
      "Professional Diploma",
    ],
  },
] as const;

export const COURSE_LEVELS = [
  "Beginner",
  "Beginner to Intermediate",
  "Intermediate",
  "Advanced",
] as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/about", label: "About" },
  { href: "/blog", label: "Blog" },
  { href: "/gallery", label: "Gallery" },
  { href: "/events", label: "Events" },
  { href: "/contact", label: "Contact" },
] as const;

export const HEADER_NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/courses", label: "Courses" },
  { href: "/about", label: "About" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
] as const;

export const EVERY_COURSE_INCLUDES = [
  "Live Projects",
  "Portfolio Building",
  "Internship Support",
  "Job Interview Preparation",
  "Career Counseling",
  "LMS Access",
  "Lifetime Notes",
  "AI-Assisted Learning",
] as const;
