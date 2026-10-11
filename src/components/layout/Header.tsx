"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Phone, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  HeaderAccountMenu,
  HeaderAccountSheetBlock,
} from "@/components/layout/HeaderAccountMenu";
import { HEADER_NAV_LINKS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DarbarTechLogo } from "@/components/common/DarbarTechLogo";

/**
 * Client component (docs/04 §4.1): the site settings it needs are read in
 * `(public)/layout.tsx` and passed in as props — it must never import the DAL.
 */
export type HeaderProps = {
  siteName: string;
  logoUrl?: string | null;
  phone: string;
  phoneHref: string;
  whatsappHref: string;
  whatsappMessage: string;
};

export function Header({
  siteName,
  logoUrl,
  phone,
  phoneHref,
  whatsappHref,
  whatsappMessage,
}: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const closeSheet = () => setOpen(false);

  const waLink = `${whatsappHref}?text=${whatsappMessage}`;

  return (
    <header
      className={cn(
        "sticky top-0 z-[80] w-full border-b border-[#222F5D]/6 bg-[#FAFCFF]/80 backdrop-blur-md supports-[backdrop-filter]:bg-[#FAFCFF]/55 transition-all duration-300 ease-out",
        scrolled && "shadow-[0_8px_28px_-12px_rgba(34,47,93,0.18)] ring-1 ring-[#222F5D]/4"
      )}
      role="banner"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between gap-2 sm:gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0 group min-h-[44px] items-center py-1"
            aria-label={`${siteName} - Go to home page`}
          >
            <DarbarTechLogo size="md" priority logoUrl={logoUrl} alt={siteName} />
          </Link>

          <nav
            role="navigation"
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-1"
          >
            {HEADER_NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "relative h-11 px-3 flex items-center justify-center rounded-xl text-sm font-medium transition-colors duration-200 ease",
                  "after:content-[''] after:absolute after:left-3 after:right-3 after:bottom-1.5 after:h-0.5 after:bg-primary after:rounded-full after:origin-left after:scale-x-0 after:transition-transform after:duration-200 after:ease",
                  isActive(link.href)
                    ? "text-primary after:scale-x-100"
                    : "text-neutral-700 hover:text-primary hover:after:scale-x-100"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <a
              href={phoneHref}
              className="hidden md:inline-flex items-center gap-1.5 h-11 px-3 rounded-xl text-sm font-medium text-neutral-700 hover:text-primary hover:bg-neutral-50 transition-colors duration-200"
              aria-label={`Call ${phone}`}
            >
              <Phone className="size-4" aria-hidden="true" />
              <span className="hidden xl:inline">{phone}</span>
            </a>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden inline-flex items-center justify-center rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 text-[#128C7E] hover:bg-[#25D366]/20 h-11 w-11 transition-all duration-200"
              aria-label="Chat on WhatsApp"
            >
              <MessageCircle className="size-5" aria-hidden="true" />
            </a>
            <Link
              href="/admissions/inquire"
              className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex h-11 px-4 sm:px-5")}
            >
              Enquire Now
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden h-11 w-11"
                  aria-label="Open menu"
                >
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[88%] sm:w-[380px] overflow-y-auto px-4 sm:px-6">
                <SheetHeader className="pt-2">
                  <SheetTitle>
                    <div className="py-1">
                      <DarbarTechLogo size="sm" logoUrl={logoUrl} alt={siteName} />
                    </div>
                  </SheetTitle>
                </SheetHeader>
                <nav
                  role="navigation"
                  aria-label="Mobile navigation"
                  className="flex flex-col gap-1 px-1 py-5"
                >
                  {HEADER_NAV_LINKS.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={closeSheet}
                      aria-current={isActive(link.href) ? "page" : undefined}
                      className={cn(
                        "rounded-xl h-12 px-4 flex items-center text-[15px] font-medium transition-colors duration-200",
                        isActive(link.href)
                          ? "bg-primary/10 text-primary"
                          : "text-neutral-800 hover:bg-neutral-100"
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                  <div className="mt-5 pt-5 border-t border-neutral-200 space-y-2.5">
                    <HeaderAccountSheetBlock onClose={closeSheet} />
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeSheet}
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "w-full h-12 border-[#25D366]/40 text-[#128C7E] hover:bg-[#25D366]/10 hover:text-[#128C7E] hover:border-[#25D366]/60"
                      )}
                    >
                      <MessageCircle className="size-5" aria-hidden="true" />
                      WhatsApp: Quick Chat
                    </a>
                    <Link
                      href="/admissions/inquire"
                      onClick={closeSheet}
                      className={cn(buttonVariants(), "w-full h-12")}
                    >
                      Enquire Now
                    </Link>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
            <HeaderAccountMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
