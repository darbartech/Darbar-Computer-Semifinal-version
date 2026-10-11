"use client";
import * as React from "react";
import Image from "next/image";
import { Star, Quote, UserCircle } from "lucide-react";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { cn } from "@/lib/utils";

type TestimonialVM = { id: string; name: string; course: string; quote: string; rating: number; image: string|null; isPlaceholder?: boolean };
interface Props { testimonials?: TestimonialVM[]; }

export function TestimonialCarousel({ testimonials = [] }: Props) {
  const count = testimonials.length;
  const [index, setIndex] = React.useState(0);
  // Must start false to match server HTML; the resize effect syncs the real value on mount.
  const [isNarrow, setIsNarrow] = React.useState(false);

  React.useEffect(() => {
    let rafId: number | null = null;
    const onResize = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setIsNarrow(window.innerWidth < 992);
      });
    };
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const perView = isNarrow ? 1 : count >= 2 ? 2 : 1;
  const maxIndex = Math.max(0, count - perView);

  /** Paused while the visitor hovers or tabs into it, and never runs on reduced motion. */
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, 6000);
    return () => clearInterval(id);
  }, [maxIndex, paused]);

  if (count === 0) return null;

  const pageCount = maxIndex + 1;

  /** A tablist of dots: only the selected one is a tab stop, arrows move between them. */
  const onDotsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const offsets: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    if (event.key in offsets) {
      event.preventDefault();
      setIndex((i) => (i + offsets[event.key] + pageCount) % pageCount);
    } else if (event.key === "Home") {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setIndex(maxIndex);
    }
  };

  return (
    <section aria-labelledby="testimonial-heading" className="section-padding bg-secondary">
      <Container size="xl">
        <SectionHeading
          eyebrow="Student Stories"
          title="What Our Graduates Say"
          description="Real feedback from students who've completed our courses and stepped into their first jobs or freelance work."
          variant="dark"
          align="left"
        />

        <div
          className="relative overflow-hidden mt-10 sm:mt-12"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${(index * 100) / perView}%)` }}
            aria-live={paused ? "polite" : "off"}
          >
            {testimonials.map((t) => (
              <div
                key={t.id}
                className={cn("shrink-0 px-1.5 sm:px-3 py-1", perView === 2 ? "w-1/2" : "w-full")}
              >
                <article className="relative h-full overflow-hidden rounded-[20px] bg-[#101F36] px-5 py-10 sm:px-8 sm:py-10">
                  <div className="relative z-[2] h-[124px] w-[124px] rounded-[70px_0_70px_70px] bg-white/5">
                    {t.image ? (
                      <Image
                        src={t.image}
                        alt={`${t.name} — testimonial`}
                        fill
                        sizes="124px"
                        className="rounded-[70px_0_70px_70px] object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center rounded-[70px_0_70px_70px] text-accent">
                        <UserCircle className="size-14" aria-hidden="true" />
                      </div>
                    )}
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-4 left-0 flex size-[30px] items-center justify-center rounded-full bg-accent text-white shadow-md"
                    >
                      <Quote className="size-3" />
                    </span>
                  </div>

                  <div
                    className="mt-7 flex gap-1"
                    aria-label={`Rated ${t.rating} out of 5 stars`}
                  >
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "size-5",
                          i < t.rating ? "fill-accent text-accent" : "fill-white/15 text-white/15"
                        )}
                        aria-hidden="true"
                      />
                    ))}
                  </div>

                  <blockquote className="mt-4 text-[15px] italic leading-7 text-white text-pretty sm:text-base">
                    {t.quote}
                    {t.isPlaceholder && <span className="sr-only"> (sample student)</span>}
                  </blockquote>

                  <h3 className="mt-6 text-[22px] font-bold leading-tight text-white">
                    {t.name}
                  </h3>
                  <p className="mt-1 text-sm text-white/60">
                    {t.course} graduate
                    {t.isPlaceholder ? " · Sample" : ""}
                  </p>

                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 h-[74px] w-20 bg-accent [clip-path:polygon(100%_0,0_100%,100%_100%)]"
                  />
                </article>
              </div>
            ))}
          </div>
        </div>

        <div
          className="mt-8 flex justify-center"
          role="tablist"
          aria-label="Testimonial pages"
          onKeyDown={onDotsKeyDown}
        >
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              tabIndex={i === index ? 0 : -1}
              aria-selected={i === index}
              aria-label={`Go to testimonial set ${i + 1}`}
              onClick={() => setIndex(i)}
              className="flex size-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full transition-colors duration-200",
                  i === index ? "bg-accent" : "bg-white/25 hover:bg-white/45"
                )}
              />
            </button>
          ))}
        </div>
      </Container>
    </section>
  );
}
