import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import {
  Target,
  Eye,
  CheckCircle2,
  UserCircle,
  ArrowRight,
  Award,
  Monitor,
  BookOpen,
  Users,
} from "lucide-react";
import { buildMetadata, orgJsonLd } from "@/lib/seo";
import { getSiteSettings } from "@/server/dal/settings";
import { listPublishedTeam } from "@/server/dal/team";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "About DarbarTech — Kathmandu's Hands-On Tech Institute",
      path: "/about",
      description:
        "Learn about DarbarTech's mission, training philosophy, and team behind Nepal's practical, career-focused computer courses.",
    },
    await getSiteSettings()
  );
}

const facilityIcons = [Monitor, BookOpen, Award, Users];

export default async function AboutPage() {
  const settings = await getSiteSettings();
  const { general, about, facilities } = settings;
  const rawTeam = await listPublishedTeam();
  const teamMembers = rawTeam.map(m => ({
    id: m.id,
    name: m.name,
    role: m.role,
    specialty: m.bio ?? m.specialty ?? "",
    image: m.photo?.url ?? null,
    isPlaceholder: !m.photo,
  }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd(settings)) }}
      />
      <div className="bg-neutral-50 border-b border-neutral-200">
      <Container size="xl" className="pt-4 pb-8 sm:pb-12">
        <Breadcrumbs
          items={[{ label: "About Us" }]}
        />
        <SectionHeading
          eyebrow="About Us"
          title={general.tagline}
          description={`Get to know ${general.name}: our story, values, trainers, and the educational philosophy that guides every course we teach.`}
          className="mt-2"
        />
      </Container>
    </div>

    <section className="py-14 sm:py-20">
      <Container size="xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
            <div className="relative rounded-2xl border border-neutral-200 bg-neutral-100 aspect-[4/3] overflow-hidden">
              <Image
                src={about.campusImageUrl}
                alt="DarbarTech Group of Technology campus building and student lounge"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <Badge variant="default" className="mb-3">Our Story</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
                Who We Are
              </h2>
              <p className="mt-4 text-neutral-700 leading-relaxed">
                {about.story}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary mb-3">
                    <Target className="size-5" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1.5">Our Mission</h3>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {about.mission}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-secondary/5 border-secondary/20">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary/15 text-secondary-foreground mb-3">
                    <Eye className="size-5" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-1.5">Our Vision</h3>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {about.vision}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </Container>
    </section>

    <section className="py-14 sm:py-20 bg-neutral-50 border-y border-neutral-200">
      <Container size="xl">
        <SectionHeading
          eyebrow="On-Campus"
          title="Our Facilities"
          description="A learning environment built for focus, practice, and collaboration."
        />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {facilities.slice(0, 6).map((f, i) => {
            const Icon = facilityIcons[i % facilityIcons.length];
            return (
              <div
                key={f} className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="size-5" />
                </div>
                <div>
                  <CheckCircle2 className="sr-only" />
                  <p className="text-[15px] font-medium text-neutral-900 leading-snug">{f}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>

    <section className="py-14 sm:py-20">
      <Container size="xl">
        <SectionHeading
          eyebrow="Our Team"
          title="Meet Our Trainers"
          description="The people who teach at our Kathmandu campus — practical, patient, and ready to help you finish what you start."
        />
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {teamMembers.map((member) => (
            <Card key={member.id} className="overflow-hidden text-center group">
              <div className="relative aspect-square bg-neutral-100 overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                  <div className="text-center">
                    <UserCircle className="size-20 mx-auto text-neutral-300" />
                    {member.isPlaceholder && (
                      <Badge variant="outline" className="mt-2 text-[10px]">PHOTO COMING SOON</Badge>
                    )}
                  </div>
                </div>
                {member.image && (
                  <Image
                    src={member.image}
                    alt={`${member.name} — ${member.role}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105 bg-neutral-100"
                  />
                )}
              </div>
              <CardContent className="p-5">
                <h3 className="font-semibold text-neutral-900">{member.name}</h3>
                <p className="text-sm font-medium text-primary">{member.role}</p>
                <p className="mt-1 text-xs text-neutral-500 leading-relaxed">
                  {member.specialty}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Container>
    </section>

    <section className="pb-20">
      <Container size="md">
        <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
            Want to see our campus in person?
          </h2>
          <p className="mt-3 text-neutral-700 leading-relaxed max-w-lg mx-auto text-pretty">
            Book a free campus tour and demo class — meet our trainers, see the labs, and get
            talk to a counselor about your goals.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/admissions/inquire"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full sm:w-auto shadow-lg shadow-primary/20"
              )}
            >
              Book a Free Demo
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/contact"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full sm:w-auto"
              )}
            >
              Contact Us
            </Link>
          </div>
        </div>
      </Container>
    </section>
    </>
  );
}
