import Link from "next/link";
import { Container } from "@/components/common/Container";
import { SectionHeading } from "@/components/common/SectionHeading";
import { Breadcrumbs } from "@/components/common/Breadcrumbs";
import { FAQAccordion } from "@/components/sections/FAQAccordion";
import { buttonVariants } from "@/components/ui/button";
import { JsonLd } from "@/components/common/JsonLd";
import { buildMetadata, faqJsonLd } from "@/lib/seo";
import { MessageSquare } from "lucide-react";
import { listPublishedFaqs } from "@/server/dal/faq";
import { getSiteSettings } from "@/server/dal/settings";

function QuestionMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <MessageSquare className="size-6" />
    </div>
  );
}

export async function generateMetadata() {
  return buildMetadata(
    {
      title: "Frequently Asked Questions",
      path: "/faq",
      description:
        "Answers on admissions, fees, installments, certification, and batch scheduling at DarbarTech Kathmandu.",
    },
    await getSiteSettings()
  );
}

type FAQItemLocal = { id: string; question: string; answer: string };
type FAQCategoryLocal = { category: string; items: FAQItemLocal[] };

export default async function FAQPage() {
  const publishedFaqs = await listPublishedFaqs();

  const rawCats = new Map<string, FAQCategoryLocal>();
  publishedFaqs.forEach((faq) => {
    const name = faq.category.name;
    if (!rawCats.has(faq.category.id))
      rawCats.set(faq.category.id, { category: name, items: [] });
    rawCats.get(faq.category.id)!.items.push({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
    });
  });
  const faqCategories = Array.from(rawCats.values());

  const allFaqs = faqCategories.flatMap((c) => c.items);

  return (
    <>
      <JsonLd
        data={faqJsonLd(allFaqs.map((f) => ({ question: f.question, answer: f.answer })))}
      />
      <div className="bg-neutral-50 border-b border-neutral-200">
        <Container size="xl" className="pt-4 pb-10 sm:pb-14">
          <Breadcrumbs items={[{ label: "FAQ" }]} />
          <div className="mt-4">
            <SectionHeading
              as="h1"
              eyebrow="Support"
              title="Frequently Asked Questions"
              description="Everything you want to know before enrolling — compiled from our most common student questions."
              className="mt-2"
            />
          </div>
        </Container>
      </div>

      <div className="pt-4" />
      <FAQAccordion faqCategories={faqCategories} compact={false} />

      <section className="py-14">
        <Container size="md">
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10 text-center shadow-sm">
            <div className="mx-auto mb-4">
              <QuestionMark />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-neutral-900 text-balance">
              Still have questions?
            </h2>
            <p className="mt-3 text-neutral-700 max-w-xl mx-auto leading-relaxed">
              Can&apos;t find an answer above? Our team is happy to help. Reach out directly or send us a message anytime.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/contact" className={buttonVariants({ size: "lg" })}>
                Contact Us
              </Link>
              <Link href="/admissions/inquire" className={buttonVariants({ variant: "outline", size: "lg" })}>
                Talk to a Counselor
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
