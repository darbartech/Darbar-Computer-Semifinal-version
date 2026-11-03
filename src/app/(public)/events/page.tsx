import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  MapPin,
  ArrowRight,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { listPublishedEvents } from "@/server/dal/events";
import { getSiteSettings } from "@/server/dal/settings";
import { buildMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Events",
      path: "/events",
      description:
        "Upcoming workshops, seminars, open houses, and certification ceremonies at Darbar Computer. Join us for free events and explore our campus.",
    },
    await getSiteSettings()
  );
}

const PLACEHOLDER_IMAGE =
  "https://images.pexels.com/photos/5539293/pexels-photo-5539293.jpeg?auto=compress&cs=tinysrgb&w=1400";

const categoryBadgeVariant: Record<string, "default" | "secondary" | "accent" | "success" | "warning" | "outline"> = {
  WORKSHOP: "accent",
  SEMINAR: "secondary",
  OPEN_HOUSE: "success",
  CERTIFICATION: "warning",
  OTHER: "outline",
};

function formatCategoryDisplay(category: string): string {
  const parts = category.split("_");
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

type PublishedEvent = Awaited<ReturnType<typeof listPublishedEvents>>[number];

function EventCard({ event }: { event: PublishedEvent }) {
  const image = event.cover?.url ?? PLACEHOLDER_IMAGE;
  const startsAt = new Date(event.startsAt);
  const upcoming = startsAt >= new Date();
  const categoryDisplay = formatCategoryDisplay(event.category as string);
  const time = formatTime(startsAt);

  return (
    <Card className="group overflow-hidden h-full flex flex-col">
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] md:grid-cols-1 lg:grid-cols-[180px_1fr]">
        <div className="relative bg-neutral-100 aspect-[16/10] sm:aspect-auto overflow-hidden border-b sm:border-b-0 sm:border-r border-neutral-100 lg:border-r lg:border-b-0">
          <Image
            src={image}
            alt={event.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 180px, (max-width: 1024px) 100vw, 180px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {!event.cover && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-100">
              <Sparkles className="size-10 text-neutral-300 opacity-60" />
            </div>
          )}
        </div>
        <CardContent className="flex-1 p-5 sm:p-6 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Badge variant={categoryBadgeVariant[event.category] ?? "outline"}>
              {categoryDisplay}
            </Badge>
            {upcoming ? (
              <Badge variant="success">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Upcoming
              </Badge>
            ) : (
              <Badge variant="outline">Past Event</Badge>
            )}
          </div>
          <h3 className="font-semibold text-[17px] tracking-tight text-neutral-900 leading-snug">
            {event.title}
          </h3>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed line-clamp-2">
            {event.shortDescription}
          </p>
          <Separator className="my-4" />
          <div className="grid grid-cols-1 gap-2 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-2">
              <Calendar className="size-3.5 text-primary shrink-0" aria-hidden="true" />
              <span className="font-medium text-neutral-700">
                {startsAt.toLocaleDateString("en-US", {
                  weekday: "short",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-3.5 text-primary shrink-0" aria-hidden="true" />
              {time}
            </span>
            <span className="inline-flex items-start gap-2">
              <MapPin className="size-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <span className="line-clamp-1">{event.location}</span>
            </span>
          </div>
          <div className="mt-5 pt-4 border-t border-neutral-100 mt-auto">
            {upcoming ? (
              <Link
                href="/admissions/inquire"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "w-full sm:w-auto group/btn"
                )}
              >
                Reserve Seat
                <ArrowRight className="size-3.5 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
              </Link>
            ) : (
              <Link
                href="/gallery"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "w-full sm:w-auto group/btn"
                )}
              >
                View Photos
                <ArrowRight className="size-3.5 transition-transform group-hover/btn:translate-x-0.5" aria-hidden="true" />
              </Link>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export default async function EventsPage() {
  const now = new Date();
  const allEvents = await listPublishedEvents();
  const upcoming = allEvents.filter((e) => new Date(e.startsAt) >= now);
  const past = allEvents.filter((e) => new Date(e.startsAt) < now);

  // Every event we have can be in the past, so open the first tab that actually
  // has cards instead of landing on an empty "Upcoming" panel.
  const defaultTab =
    upcoming.length === 0 && past.length > 0 ? "past" : "upcoming";

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-12">
          <Breadcrumbs items={[{ label: "Events" }]} />
          <SectionHeading
            as="h1"
            eyebrow="What's Happening"
            title="Events at Darbar Computer"
            description="Workshops, open houses, free seminars, certification ceremonies, and info sessions. Join us on campus or online."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-12 sm:py-16">
        <Container size="xl">
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList>
              <TabsTrigger value="upcoming">
                Upcoming Events
                {upcoming.length > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">
                    {upcoming.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="past">
                Past Events
                {past.length > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-700">
                    {past.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all">
                All Events
                <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-700">
                  {allEvents.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">
              {upcoming.length === 0 ? (
                <EmptyState
                  title="No upcoming events right now"
                  description="New workshops, seminars, and open houses are scheduled every month. Check back soon or follow us on social media for announcements."
                />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {upcoming.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="past">
              {past.length === 0 ? (
                <EmptyState
                  title="No past events on record"
                  description="As we host more events, photos and recaps will appear here. Check the Upcoming tab to see what's next."
                />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {past.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="all">
              {allEvents.length === 0 ? (
                <EmptyState
                  title="No events on record"
                  description="Events are being scheduled. Check back soon."
                />
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {allEvents.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Container>
      </section>

      <section className="pb-20">
        <Container size="md">
          <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
              Don&apos;t want to miss the next event?
            </h2>
            <p className="mt-3 text-neutral-700 leading-relaxed max-w-lg mx-auto text-pretty">
              Send us a quick message and we&apos;ll add you to our event notification list — no spam,
              just workshop and open-house announcements.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/admissions/inquire"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "w-full sm:w-auto shadow-lg shadow-primary/20"
                )}
              >
                Notify Me of Events
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

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-12 sm:p-16 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
        <Calendar className="size-7" />
      </div>
      <h3 className="text-xl font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-neutral-600 max-w-md mx-auto leading-relaxed">{description}</p>
    </div>
  );
}
