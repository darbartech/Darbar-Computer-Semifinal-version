import Link from "next/link";
import { Suspense } from "react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/common/Badge";
import {
  AdmissionInquiryForm,
  type InquiryCourseOption,
} from "@/components/forms/AdmissionInquiryForm";
import { Separator } from "@/components/ui/separator";
import {
  PhoneCall,
  Mail,
  MapPin,
  Clock3,
  CheckCircle2,
  ArrowLeft,
  Info,
} from "lucide-react";
import { listPublishedCourses } from "@/server/dal/courses";
import { getSiteSettings } from "@/server/dal/settings";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Admission Inquiry",
      path: "/admissions/inquire",
      description:
        "Send an admission inquiry to our team. Tell us about your goals and we'll help match you to the right course — free counseling, no commitments.",
    },
    await getSiteSettings()
  );
}

const benefits = [
  "Free 1-on-1 career counseling session",
  "Free demo class before you enroll",
  "Honest course guidance, no pushy sales",
  "Transparent fees & installment options explained",
];

export default async function AdmissionInquiryPage({
  searchParams,
}: {
  searchParams: Promise<{
    course?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}) {
  const params = await searchParams;
  // Published courses come from the DAL; the client form only receives props.
  const { contact, hours, general } = await getSiteSettings();
  const courses = await listPublishedCourses();
  const courseOptions: InquiryCourseOption[] = courses.map((course) => ({
    slug: course.slug,
    title: course.title,
    category: course.category,
    level: course.level,
  }));
  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-10">
          <Breadcrumbs
            items={[
              { label: "Admissions" },
              { label: "Inquiry Form" },
            ]}
          />
          <div className="mt-2">
            <Link href="/courses" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mb-3">
              <ArrowLeft className="size-4" />
              Back to courses
            </Link>
          </div>
          <SectionHeading
            as="h1"
            eyebrow="Admissions"
            title="Start Your Journey — Send an Inquiry"
            description="Tell us about your goals and we'll match you with the right course. Free counseling, free demo, no enrollment pressure."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-10 sm:py-14">
        <Container size="xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-6 sm:p-8">
                  <div className="flex items-start justify-between gap-3 mb-5 pb-5 border-b border-neutral-100">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-neutral-900">
                        Admission Inquiry Form
                      </h2>
                      <p className="mt-1 text-sm text-neutral-600">
                        All fields marked with <span className="text-destructive">*</span> are required.
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      <Info className="size-3 mr-1" />
                      Takes ~2 minutes
                    </Badge>
                  </div>
                  <Suspense fallback={<div className="py-12 text-center text-neutral-500">Loading form...</div>}>
                    <AdmissionInquiryForm
                      courses={courseOptions}
                      siteName={general.name}
                      initialValues={{
                        course: params.course ?? "",
                        utmSource: params.utm_source ?? "",
                        utmMedium: params.utm_medium ?? "",
                        utmCampaign: params.utm_campaign ?? "",
                      }}
                    />
                  </Suspense>
                </CardContent>
              </Card>
            </div>

            <aside className="lg:col-span-1 space-y-5">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-accent" />
                    Why Inquire?
                  </h3>
                  <ul className="space-y-2.5">
                    {benefits.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-neutral-700">
                        <CheckCircle2 className="size-4 text-accent shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-neutral-900">Contact Directly</h3>
                  <Separator />
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-2.5">
                      <PhoneCall className="size-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-neutral-500 font-medium">Call / WhatsApp</div>
                        <a href={contact.telHref} className="font-medium text-neutral-900 hover:text-primary">
                          {contact.phone}
                        </a>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Mail className="size-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-neutral-500 font-medium">Email</div>
                        <a href={contact.mailHref} className="font-medium text-neutral-900 hover:text-primary break-all">
                          {contact.email}
                        </a>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <MapPin className="size-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-neutral-500 font-medium">Visit us</div>
                        <span className="text-neutral-700 leading-relaxed">{contact.address}</span>
                      </div>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Clock3 className="size-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs text-neutral-500 font-medium">Hours</div>
                        <div className="text-neutral-700 space-y-0.5 text-xs leading-relaxed">
                          {hours.map((h, i) => (
                            <div key={i} className="flex justify-between gap-3">
                              <span>{h.day}</span>
                              <span className="text-neutral-500">{h.time}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
