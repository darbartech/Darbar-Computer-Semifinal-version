import { Hero } from "@/components/sections/Hero";
import { CourseGrid } from "@/components/sections/CourseGrid";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { TestimonialCarousel } from "@/components/sections/TestimonialCarousel";
import { FAQAccordion, type FAQCategory as FAQCatView } from "@/components/sections/FAQAccordion";
import { getFeaturedCourses } from "@/server/dal/courses";
import { getSiteSettings } from "@/server/dal/settings";
import { listPublishedTestimonials } from "@/server/dal/testimonials";
import { listPublishedFaqs } from "@/server/dal/faq";
import { buildMetadata } from "@/lib/seo";
import { orgJsonLd } from "@/lib/seo";

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Computer Training Institute in Kathmandu — 37 Courses",
      path: "/",
      description:
        "Programming, web development, AI, design, networking & more. Certified trainers, small batches, real projects. Book a free consultation.",
      keywords: [
        "computer training",
        "computer institute Nepal",
        "programming courses",
        "Darbar Computer",
        "IT training Kathmandu",
        "computer training institute Kathmandu",
        "computer courses in Nepal",
        "hands-on IT training",
      ],
    },
    await getSiteSettings()
  );
}

export default async function HomePage() {
  const settings = await getSiteSettings();
  const featuredCourses = await getFeaturedCourses(6);
  const rawT = await listPublishedTestimonials();
  const tData = rawT.map(t => ({
    id: t.id,
    name: t.name,
    course: t.course?.title ?? (t as { courseLabel?: string | null }).courseLabel ?? "",
    quote: t.quote,
    rating: t.rating,
    image: t.photo?.url ?? null,
    isPlaceholder: false,
  }));

  const faqs = await listPublishedFaqs();
  const faqMap = new Map<string, FAQCatView>();
  faqs.forEach((faq) => {
    if (!faqMap.has(faq.category.id)) {
      faqMap.set(faq.category.id, { category: faq.category.name, items: [] });
    }
    faqMap.get(faq.category.id)!.items.push({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
    });
  });
  const faqCategories = Array.from(faqMap.values());

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd(settings)) }}
      />
      <Hero hero={settings.hero} />
      <CourseGrid
        courses={featuredCourses}
        eyebrow="Popular Courses"
        title="Our Most-Loved Courses"
        description="Hand-picked programs our students enroll in the most — entry-level foundations to flagship career paths."
      />
      <WhyChooseUs />

      <TestimonialCarousel testimonials={tData} />
      <FAQAccordion faqCategories={faqCategories} compact />
    </>
  );
}
