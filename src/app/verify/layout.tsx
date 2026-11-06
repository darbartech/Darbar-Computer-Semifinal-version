import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/common/JsonLd";
import { websiteJsonLd, orgJsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";

export default async function VerifyLayout({
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
        whatsappHref={settings.contact.whatsappHref}
        whatsappMessage={encodeURIComponent(
          `Hi ${settings.general.name}! I'd like to inquire about your courses.`
        )}
      />
      <main id="main-content" className="flex-1 flex flex-col">
        {children}
      </main>
      <Footer settings={settings} />
    </>
  );
}
