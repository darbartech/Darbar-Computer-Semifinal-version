import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { getSiteSettings } from "@/server/dal/settings";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#15678E",
};

/**
 * Site-wide SEO defaults come from the `general` SiteSetting (docs/04 §4.1).
 * Reading them in `generateMetadata` is what makes the title template follow an
 * admin rename; `invalidate("settings")` makes the change appear on the next hit.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { general } = await getSiteSettings();

  return {
    metadataBase: new URL(general.siteUrl),
    title: {
      default: `${general.name} — ${general.description.slice(0, 60)}`,
      template: `%s | ${general.name}`,
    },
    description: general.description,
    keywords: [
      "computer training",
      "computer institute Nepal",
      "programming courses",
      "DarbarTech",
      "Darbar Tech",
      "Group of Technology",
      "IT training Kathmandu",
      "MS Office training",
      "web development course Nepal",
    ],
    authors: [{ name: general.name, url: general.siteUrl }],
    creator: general.name,
    publisher: general.name,
    applicationName: general.name,
    alternates: {
      canonical: "/",
    },
    manifest: "/site.webmanifest",
    openGraph: {
      type: "website",
      url: general.siteUrl,
      siteName: general.name,
      title: general.name,
      description: general.description,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: general.name,
      description: general.description,
      creator: general.twitterHandle,
      site: general.twitterHandle,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/favicon.svg", rel: "icon", type: "image/svg+xml" },
      ],
      shortcut: ["/favicon.svg"],
      apple: [
        { url: "/apple-touch-icon.svg", type: "image/svg+xml" },
      ],
      other: [
        {
          rel: "apple-touch-icon-precomposed",
          url: "/apple-touch-icon.svg",
          type: "image/svg+xml",
        },
      ],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body className="min-h-dvh flex flex-col bg-background antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
