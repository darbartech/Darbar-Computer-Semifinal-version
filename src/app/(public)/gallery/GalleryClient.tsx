"use client";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/common/Badge";
import { cn } from "@/lib/utils";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Image as ImageIcon, ArrowRight, X } from "lucide-react";

type GalleryImageVM = { id: string; title: string; category: string; alt: string; url: string; width: number|null; height: number|null };
interface Props { initialImages: GalleryImageVM[]; categories: string[]; }

export function GalleryClient({ initialImages, categories }: Props) {
  const [activeCategory, setActiveCategory] = React.useState<string>("All");
  const [selectedImage, setSelectedImage] = React.useState<GalleryImageVM | null>(null);

  const images = activeCategory === "All"
    ? initialImages
    : initialImages.filter(img => img.category === activeCategory);

  const counts = React.useMemo(() => {
    const map: Record<string, number> = { All: initialImages.length };
    categories.forEach((c) => {
      if (c !== "All") map[c] = initialImages.filter((g) => g.category === c).length;
    });
    return map;
  }, [initialImages, categories]);

  return (
    <>
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-8 sm:pb-12">
          <Breadcrumbs items={[{ label: "Gallery" }]} />
          <SectionHeading
            eyebrow="Photo Gallery"
            title="Life at Darbar Computer"
            description="Glimpses of our campus, labs, classes, events, and the moments our students and graduates share."
            className="mt-2"
          />
        </Container>
      </div>

      <section className="py-12 sm:py-16">
        <Container size="xl">
          <Tabs
            defaultValue="All"
            value={activeCategory}
            onValueChange={(v) => setActiveCategory(v)}
            className="w-full"
          >
            <div className="sticky top-[var(--header-h)] z-20 -mx-4 px-4 pb-4 bg-gradient-to-b from-background via-background to-transparent">
              <TabsList className="flex-wrap h-auto gap-1 p-2 min-h-[48px]">
                {categories.map((cat) => (
                  <TabsTrigger key={cat} value={cat}>
                    {cat}
                    <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-neutral-200 px-1.5 text-[11px] font-semibold text-neutral-700 data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                      {counts[cat] ?? 0}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {categories.map((cat) => (
              <TabsContent key={cat} value={cat}>
                {cat !== "All" && cat !== activeCategory ? null : (
                  <>
                    {images.length === 0 ? (
                      <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-neutral-50 p-12 sm:p-16 text-center">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-200 text-neutral-500">
                          <ImageIcon className="size-7" />
                        </div>
                        <h3 className="text-xl font-semibold text-neutral-900">
                          No photos in this category yet
                        </h3>
                        <p className="mt-2 text-neutral-600 max-w-md mx-auto leading-relaxed">
                          New photos are added after every event and batch ceremony. Check back soon.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                        {images.map((img, idx) => {
                          const spanLarge = idx % 7 === 0;
                          return (
                            <button
                              key={img.id}
                              type="button"
                              onClick={() => setSelectedImage(img)}
                              className={`group relative overflow-hidden rounded-xl bg-neutral-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 ${
                                spanLarge
                                  ? "col-span-2 sm:col-span-2 aspect-[16/10]"
                                  : "aspect-square sm:aspect-[4/3]"
                              }`}
                              aria-label={`Open photo: ${img.title ?? img.alt}`}
                              aria-haspopup="dialog"
                            >
                              <Image
                                src={img.url}
                                alt={img.alt}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                className="object-cover transition-transform duration-500 group-hover:scale-110"
                                onError={(e) => {
                                  ((e.currentTarget as HTMLImageElement).style.display = "none");
                                }}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center text-primary-foreground p-4">
                                  <ImageIcon className="size-12 mx-auto text-neutral-200 opacity-80" />
                                </div>
                              </div>
                              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all text-left">
                                {img.title && (
                                  <p className="text-white font-semibold text-[13px] sm:text-sm leading-tight line-clamp-2">
                                    {img.title}
                                  </p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Container>
      </section>

      <section className="pb-20">
        <Container size="md">
          <div className="rounded-2xl border border-neutral-200 bg-gradient-to-br from-primary/5 via-white to-secondary/5 p-8 sm:p-12 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 text-balance">
              Want to be in our next gallery post?
            </h2>
            <p className="mt-3 text-neutral-700 leading-relaxed max-w-lg mx-auto text-pretty">
              Join a course, attend an open house, or book a campus tour — and be part of the next
              batch of Darbar Computer memories.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/courses"
                className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto shadow-lg shadow-primary/20")}
              >
                Explore Courses
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/admissions/inquire"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full sm:w-auto")}
              >
                Book a Campus Tour
              </Link>
            </div>
          </div>
        </Container>
      </section>

      <Dialog open={!!selectedImage} onOpenChange={(o) => !o && setSelectedImage(null)}>
        <DialogContent className="sm:max-w-5xl p-0 gap-0 overflow-hidden" showClose={false}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_280px]">
            <div className="relative bg-neutral-900 aspect-[4/3] sm:aspect-auto sm:min-h-[500px]">
              {selectedImage && (
                <Image
                  src={selectedImage.url}
                  alt={selectedImage.alt}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority
                  onError={(e) => {
                    ((e.currentTarget as HTMLImageElement).style.display = "none");
                  }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <ImageIcon className="size-20 text-white/30" />
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                aria-label="Close preview"
                className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-col p-6">
              <DialogHeader className="text-left">
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {selectedImage?.title ?? "Gallery Photo"}
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-neutral-600 leading-relaxed">
                  {selectedImage?.alt}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 space-y-3">
                {selectedImage?.category && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-neutral-500 shrink-0">Category</span>
                    <Badge variant="default">{selectedImage.category}</Badge>
                  </div>
                )}
              </div>
              <div className="mt-auto pt-6 space-y-2">
                <Link
                  href="/events"
                  onClick={() => setSelectedImage(null)}
                  className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                >
                  See Related Events
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/admissions/inquire"
                  onClick={() => setSelectedImage(null)}
                  className={cn(buttonVariants(), "w-full")}
                >
                  Join a Course
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
