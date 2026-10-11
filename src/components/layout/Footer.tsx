import Link from "next/link";
import {
  Share2,
  Image,
  Briefcase,
  MapPin,
  Phone,
  Mail,
  Clock,
  PlayCircle,
  ArrowRight,
  MessageCircle,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { NAV_LINKS } from "@/lib/constants";
import type { SiteSettingsView } from "@/lib/settings-view";
import { DarbarTechLogo } from "@/components/common/DarbarTechLogo";
import { getFeaturedCourses } from "@/server/dal/courses";
import { cn } from "@/lib/utils";

const socialIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  facebook: Share2,
  instagram: Image,
  youtube: PlayCircle,
  linkedin: Briefcase,
  whatsapp: MessageCircle,
};

function FooterContactCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      {children}
    </div>
  );
}

function FooterContactRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
        {icon}
      </div>
      <div className="pt-0.5 min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
          {label}
        </div>
        <div className="mt-1 text-[13.5px] leading-relaxed text-neutral-200">{children}</div>
      </div>
    </div>
  );
}

function FooterMetaLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center min-h-[28px] text-neutral-200 hover:text-white/90 transition-colors duration-200 break-words"
    >
      {children}
    </a>
  );
}

function FooterColumnHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4 sm:mb-5">
      <h3 className="text-[13px] font-bold text-white uppercase tracking-[0.12em]">
        {children}
      </h3>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" aria-hidden="true" />
    </div>
  );
}

function FooterLink({
  href,
  children,
  external = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "group/link relative inline-flex w-fit items-center min-h-[34px] py-0.5 text-[13.5px] text-neutral-400 transition-all duration-200 ease-out",
    "hover:text-white",
    className
  );
  const inner = (
    <>
      <span className="relative z-10 flex items-center gap-1.5">
        <span
          className="pointer-events-none absolute left-0 top-1/2 block h-1.5 w-0 -translate-y-1/2 rounded-full bg-primary/25 transition-all duration-200 ease-out group-hover/link:w-full"
          aria-hidden="true"
        />
        <span className="relative z-10">{children}</span>
        <ArrowRight
          className="size-3.5 -translate-x-1 opacity-0 transition-all duration-200 ease-out group-hover/link:translate-x-0 group-hover/link:opacity-100"
          aria-hidden="true"
        />
      </span>
    </>
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={classes}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={classes}>
      {inner}
    </Link>
  );
}

export type FooterProps = {
  /** Resolved settings, passed down by `(public)/layout.tsx` (docs/04 §4.1). */
  settings: SiteSettingsView;
};

export async function Footer({ settings }: FooterProps) {
  const { general, contact, hours, socials } = settings;
  const year = new Date().getFullYear();
  const quickLinks = [
    ...NAV_LINKS.filter((l) => l.href !== "/"),
    { href: "/faq", label: "FAQ" },
    { href: "/admissions/inquire", label: "Admissions" },
    { href: "/verify", label: "Verify Certificate" },
    { href: "/student/login", label: "Student Login" },
    { href: "/student/register", label: "Student Register" },
  ];
  const featuredCourses = await getFeaturedCourses(4);
  const contactActions = [
    { label: "Call", href: contact.telHref, icon: <Phone className="size-4" aria-hidden="true" /> },
    {
      label: "WhatsApp",
      href: contact.whatsappHref,
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
    },
    {
      label: "Email",
      href: contact.mailHref,
      icon: <Mail className="size-4" aria-hidden="true" />,
    },
  ];

  return (
    <footer
      className="relative isolate overflow-hidden bg-[#0A1729] text-neutral-300 mt-auto"
      role="contentinfo"
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.35]"
        aria-hidden="true"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(21, 103, 142, 0.18) 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-secondary/40 blur-[140px]" />
      </div>

      <div className="relative h-1 w-full gradient-primary shadow-[0_1px_0_0_rgba(21,103,142,0.25)]" aria-hidden="true" />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 sm:pt-16 lg:pt-20 pb-6 sm:pb-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-12 lg:gap-12">
          <div className="sm:col-span-12 lg:col-span-5">
            <Link href="/" className="inline-flex items-center gap-2 mb-5 group/logo">
              <DarbarTechLogo size="lg" variant="dark" logoUrl={general.logoUrl} alt={general.name} />
            </Link>
            <p className="text-[13.5px] leading-relaxed text-neutral-400 max-w-md mb-6 text-balance">
              <span className="font-semibold text-neutral-200">{general.tagline}.</span>{" "}
              Hands-on computer training in Kathmandu with career-focused programs in programming, web development, AI, design, networking, and digital marketing.
            </p>

            <div className="mb-7">
              <FooterContactCard>
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {contactActions.map((action) => (
                      <a
                        key={action.label}
                        href={action.href}
                        target={action.label === "WhatsApp" ? "_blank" : undefined}
                        rel={action.label === "WhatsApp" ? "noopener noreferrer nofollow" : undefined}
                        className={cn(
                          "inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5",
                          "text-[13px] font-semibold text-neutral-200 transition-all duration-200",
                          "hover:border-primary/40 hover:bg-white/[0.06] hover:text-white"
                        )}
                      >
                        <span className="text-primary">{action.icon}</span>
                        {action.label}
                      </a>
                    ))}
                  </div>
                  <div className="h-px w-full bg-white/10" aria-hidden="true" />
                  <FooterContactRow icon={<MapPin className="size-4" aria-hidden="true" />} label="Campus">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-neutral-200">{contact.address}</span>
                      <a
                        href={contact.mapsHref}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex w-fit items-center gap-2 text-[12px] font-semibold text-primary/90 hover:text-primary transition-colors duration-200"
                      >
                        Open in Google Maps <ArrowRight className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  </FooterContactRow>

                  <FooterContactRow icon={<Clock className="size-4" aria-hidden="true" />} label="Office Hours">
                    <ul className="space-y-1.5 text-[13px]">
                      {hours.map((h, i) => (
                        <li
                          key={i}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5"
                        >
                          <span className="font-medium text-neutral-200">{h.day}</span>
                          <span className="text-neutral-400 text-right whitespace-nowrap">{h.time}</span>
                        </li>
                      ))}
                    </ul>
                  </FooterContactRow>
                </div>
              </FooterContactCard>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500 mb-3">
                Follow us
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {socials.map((s) => {
                  const Icon = socialIconMap[s.icon] ?? Share2;
                  return (
                    <a
                      key={s.name}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${general.name} on ${s.name}`}
                      className="group/social flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-primary/40 hover:text-white"
                    >
                      <Icon className="size-[17px]" aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="sm:col-span-6 lg:col-span-3">
            <FooterColumnHeading>Quick Links</FooterColumnHeading>
            <ul className="space-y-1">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="sm:col-span-6 lg:col-span-4">
            <FooterColumnHeading>Popular Courses</FooterColumnHeading>
            <ul className="space-y-1 mb-4">
              {featuredCourses.map((course) => (
                <li key={course.slug}>
                  <FooterLink href={`/courses/${course.slug}`}>
                    <span className="line-clamp-1">{course.title}</span>
                  </FooterLink>
                </li>
              ))}
            </ul>
            <Link
              href="/courses"
              className="group/all inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2.5 text-[13px] font-semibold text-primary transition-all duration-200 ease-out hover:border-primary/50 hover:bg-primary hover:text-white hover:shadow-md hover:shadow-primary/20"
            >
              Explore all courses
              <ArrowRight
                className="size-4 transition-transform duration-200 group-hover/all:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </div>

        <Separator className="my-7 sm:my-9 border-white/8" />

        <div className="flex flex-col-reverse items-start gap-5 sm:gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-neutral-500 w-full sm:w-auto">
            <Link
              href="/about"
              className="hover:text-neutral-300 min-h-[30px] inline-flex items-center transition-colors duration-200"
            >
              About Us
            </Link>
            <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
            <Link
              href="/faq"
              className="hover:text-neutral-300 min-h-[30px] inline-flex items-center transition-colors duration-200"
            >
              FAQ
            </Link>
            <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
            <Link
              href="/contact"
              className="hover:text-neutral-300 min-h-[30px] inline-flex items-center transition-colors duration-200"
            >
              Contact
            </Link>
            <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
            <Link
              href="/sitemap.xml"
              className="hover:text-neutral-300 min-h-[30px] inline-flex items-center transition-colors duration-200"
            >
              Sitemap
            </Link>
            <span className="h-3.5 w-px bg-white/10" aria-hidden="true" />
            <a
              href="#main-content"
              className="hover:text-neutral-300 min-h-[30px] inline-flex items-center transition-colors duration-200"
            >
              Back to top
            </a>
          </div>
          <div className="text-[12px] text-neutral-500 leading-relaxed flex flex-wrap items-center gap-2">
            © {year} {general.name}. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
}
