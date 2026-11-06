// [PLACEHOLDER FAQ - confirm all policy answers with Darbar Computer admin before publishing]
// Per build document §6.10 and course catalog content §11

export interface FAQCategory {
  category: string;
  items: FAQItem[];
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  isPlaceholder?: boolean;
}

export const faqCategories: FAQCategory[] = [
  {
    category: "Admissions",
    items: [
      {
        id: "adm-1",
        question: "Do I need prior computer experience to enroll?",
        answer: "Most courses assume no prior experience; prerequisites (if any) are listed on each course page. We have tracks from absolute beginner (Basic Computer Literacy, Computer Fundamentals) up to advanced professional programs.",
      },
      {
        id: "adm-2",
        question: "Can I switch batches after enrolling?",
        answer: "Batch swaps are handled on a case-by-case basis. Talk to our front desk within the first week of classes to check seat availability in your preferred target batch — we'll do our best to accommodate your schedule if capacity allows.",
      },
      {
        id: "adm-3",
        question: "Is there an age limit?",
        answer: "Most courses are open to ages 14+; some short courses (Basic Computer Literacy) have no age restriction. For minors, a guardian signature may be required at enrollment.",
      },
    ],
  },
  {
    category: "Fees",
    items: [
      {
        id: "fee-1",
        question: "Are installment plans available?",
        answer: "Yes, for most courses over NPR 8,000 — see each course's fee note for details on available installments (typically 2–3 equal parts).",
      },
      {
        id: "fee-2",
        question: "What is the refund policy?",
        answer: "Our enrollment team will walk you through our current refund and cancellation policy in writing before you complete your payment — please review it carefully and ask any questions at the time of enrollment, as terms vary by course and batch.",
      },
      {
        id: "fee-3",
        question: "Which payment methods are accepted?",
        answer: "We accept cash, bank transfer, mobile wallets (eWallet), and card payment at the front desk. Ask about group discounts for schools, colleges, or corporate batches.",
      },
    ],
  },
  {
    category: "Courses & Certification",
    items: [
      {
        id: "cert-1",
        question: "Will I receive a certificate on completion?",
        answer: "Yes, every student who meets the minimum attendance requirement (typically 80%+ of classes) and successfully completes their final project or assessment receives a DarbarTech Institute completion certificate. Industry-pathway certificates (where noted on the course page) reflect that the curriculum is aligned with the standards of those certification bodies; contact us for details on any individual course's credentials.",
      },
      {
        id: "cert-2",
        question: "Are classes available in the evening for working professionals?",
        answer: "Most courses offer morning, day, and evening batch options. Check the course detail page or ask at the front desk for current batch schedules.",
      },
      {
        id: "cert-3",
        question: "What is the typical class size?",
        answer: "Our classes are intentionally kept small — usually 8–15 students — so every student gets individual trainer attention and adequate lab time.",
      },
    ],
  },
];
