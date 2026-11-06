import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { WhatsAppButton } from "@/components/common/WhatsAppButton";
import { SiteNoticePopup } from "@/components/common/SiteNoticePopup";
import { JsonLd } from "@/components/common/JsonLd";
import { websiteJsonLd, orgJsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";

/**
 * The settings read lives here, not in the client components (docs/04 §4.1):
 * `Header` and `WhatsAppButton` are "use client", so they receive the values they
 * need as props instead of importing the DAL.
 *
 * `revalidate` is the safety net half of the caching story (re-audit #1). Every
 * read below goes through `cached(tags, …)`, and an admin write calls
 * `invalidate(...)` → `updateTag` on those tags, which expires the page for the
 * next request — that is what makes a publish visible immediately. The 300
 * seconds only covers a read that carries no tag at all, so a missed tag cannot
 * leave a marketing page wrong indefinitely. `/student/*` overrides this with
 * `force-dynamic`; the nonce'd surfaces are never cached.
 */
export const revalidate = 300;

export default async function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = await getSiteSettings();

  return (
    <>
      <JsonLd data={orgJsonLd(settings)} />
      <JsonLd data={websiteJsonLd(settings)} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md focus:shadow-lg"
      >
        Skip to content
      </a>
      <Header
        siteName={settings.general.name}
        logoUrl={settings.general.logoUrl}
        whatsappHref={settings.contact.whatsappHref}
        whatsappMessage={encodeURIComponent(
          `Hi ${settings.general.name}! I'd like to inquire about your courses.`
        )}
      />
      <main id="main-content" className="flex-1 flex flex-col">
        {children}
      </main>
      {/* Async: reads the featured courses through the DAL (docs/06 §3). */}
      <Footer settings={settings} />
      <WhatsAppButton
        whatsappHref={settings.contact.whatsappHref}
        whatsappMessage={encodeURIComponent(settings.contact.whatsappMessage)}
        phoneDisplay={settings.contact.whatsappDisplay}
      />
      <SiteNoticePopup />
    </>
  );
}
