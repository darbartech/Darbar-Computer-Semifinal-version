import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ContactForm } from "@/components/forms/ContactForm";
import {
  MapPin,
  PhoneCall,
  Mail,
  Clock3,
  Share2,
  MessageCircle,
  Video,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { buildMetadata } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";
import { cn } from "@/lib/utils";

const socialIcons = [Share2, MessageCircle, Video, Briefcase];

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Contact DarbarTech — Book a Free Course Consultation",
      path: "/contact",
      description:
        "Questions about courses or batches? Contact DarbarTech's Kathmandu campus or book a free, no-obligation consultation.",
    },
    await getSiteSettings()
  );
}

export default async function ContactPage() {
  const { contact, hours, socials } = await getSiteSettings();

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs items={[{ label: "Contact Us" }]} />
          <SectionHeading
            as="h1"
            eyebrow="Get in Touch"
            title="We'd Love to Hear From You"
            description="Questions about courses, enrollment, corporate training, partnerships, or anything else? Reach out through any channel below — we respond within one business day."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="relative overflow-hidden rounded-2xl border border-neutral-200 mb-10 aspect-[21/9] bg-neutral-100">
            <Image
              src="/images/seed/pexels-10638115.jpg"
              alt="DarbarTech reception and student counseling area"
              fill
              priority
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/20 to-transparent" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 lg:p-10">
              <div className="max-w-xl">
                <p className="text-white/90 text-sm sm:text-base font-medium leading-relaxed">
                  Our friendly team is ready to guide you — whether you&apos;re exploring courses, need advice on the right track, or want to schedule a campus visit and free demo class.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <MapPin className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">Visit Our Campus</h3>
                    <p className="mt-1 text-sm text-neutral-700 leading-relaxed">
                      {contact.address}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <PhoneCall className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">Call or WhatsApp</h3>
                    <a
                      href={contact.telHref}
                      className="mt-1 block text-sm font-medium text-neutral-900 hover:text-primary"
                    >
                      {contact.phone}
                    </a>
                  </div>
                </div>
                <Separator />
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Mail className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">Email</h3>
                    <a
                      href={contact.mailHref}
                      className="mt-1 block text-sm font-medium text-neutral-900 hover:text-primary break-all"
                    >
                      {contact.email}
                    </a>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-2xl border border-neutral-200 overflow-hidden mb-10">
            <div className="bg-neutral-100 relative aspect-[4/3] sm:aspect-[16/9]">
              <iframe
                src={contact.mapEmbedUrl}
                title="DarbarTech campus location on Google Maps"
                className="h-full w-full absolute inset-0"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-6">
                <div className="text-center p-5 sm:p-6 rounded-xl bg-white/90 backdrop-blur-sm max-w-md">
                  <p className="text-sm font-medium text-neutral-900 leading-relaxed">
                    {contact.address}
                  </p>
                  <a
                    href={contact.mapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline font-medium"
                  >
                    Open in Google Maps
                    <ArrowRight className="size-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <h2 className="text-xl font-bold tracking-tight text-neutral-900 mb-1">
                    Send us a Message
                  </h2>
                  <p className="text-sm text-neutral-600 mb-6">
                    Fill out the form and we&apos;ll get back to you within one business day.
                  </p>
                  <Suspense fallback={<div className="py-12 text-center text-neutral-500">Loading form...</div>}>
                    <ContactForm />
                  </Suspense>
                </CardContent>
              </Card>
            </div>

            <aside className="lg:col-span-1 space-y-5">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <Clock3 className="size-4 text-primary" />
                    Business Hours
                  </h3>
                  <Separator className="mb-3" />
                  <ul className="space-y-2.5 text-sm">
                    {hours.map((h, i) => (
                      <li key={i} className="flex justify-between items-start gap-3">
                        <span className="font-medium text-neutral-900">{h.day}</span>
                        <span className="text-neutral-600 text-right">{h.time}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-neutral-900 mb-3">Follow & Connect</h3>
                  <Separator className="mb-4" />
                  <div className="grid grid-cols-2 gap-2.5">
                    {socials.map((s, i) => {
                      const Icon = socialIcons[i % socialIcons.length];
                      return (
                        <a
                          key={s.name}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="flex items-center gap-2.5 rounded-lg border border-neutral-200 p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors"
                        >
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <span className="text-sm font-medium text-neutral-800">{s.name}</span>
                        </a>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-white to-secondary/5">
                <CardContent className="p-6 text-center">
                  <h3 className="font-semibold text-neutral-900 mb-1">Ready to Enroll?</h3>
                  <p className="mt-1 text-sm text-neutral-700 leading-relaxed">
                    Start your admission inquiry in under 2 minutes — or book a free demo class.
                  </p>
                  <div className="mt-4 flex flex-col sm:flex-row lg:flex-col gap-2">
                    <Link
                      href="/admissions/inquire"
                      className={cn(buttonVariants(), "w-full shadow-md shadow-primary/20")}
                    >
                      Enquire About Admission
                    </Link>
                    <Link
                      href="/faq"
                      className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                    >
                      Read the FAQ
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
