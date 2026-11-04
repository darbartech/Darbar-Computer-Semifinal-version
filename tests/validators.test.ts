import { describe, it, expect } from "vitest";
import {
  inquirySchema,
  leadFilterSchema,
  bulkLeadActionSchema,
  updateLeadStatusSchema,
  LEAD_PAGE_SIZE,
} from "../src/lib/validators/lead";
import {
  contactSchema,
  contactFilterSchema,
  updateMessageStatusSchema,
} from "../src/lib/validators/contact";
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  MANUAL_ACTIVITY_TYPES,
  MESSAGE_STATUSES,
  NAME_PATTERN,
  PREFERRED_BATCHES,
} from "../src/lib/validators/shared";
import {
  COURSE_LEVELS,
  COURSE_STATUSES,
  LEARNING_MODES,
  TIME_SLOTS,
  categoryWriteSchema,
  courseFilterSchema,
  courseWriteSchema,
} from "../src/lib/validators/course";
import {
  CourseLevel,
  LearningMode,
  TimeSlot,
} from "../src/generated/prisma/enums";
import { externalMediaSchema } from "../src/lib/validators/media";
import {
  ASSIGNMENT_STATUSES,
  SUBMISSION_REVIEW_STATUSES,
  assignmentWriteSchema,
  submissionReviewSchema,
  submissionWriteSchema,
} from "../src/lib/validators/assignments";
import {
  NOTICE_STATUSES,
  NOTICE_TYPES,
  noticeWriteSchema,
} from "../src/lib/validators/notices";
import {
  LeadActivityType,
  LeadSource,
  LeadStatus,
  MessageStatus,
  NoticeType,
  PreferredBatch,
  PublishStatus,
  SubmissionReviewStatus,
} from "../src/generated/prisma/enums";

const validInquiry = {
  fullName: "Ram Sharma",
  phone: "+977-9800000000",
  email: "ram@example.com",
  courseSlug: "basic-computer",
  preferredBatch: "MORNING",
  message: "I want to join the evening class.",
  consent: true,
  website: "",
  utmSource: "facebook",
  utmMedium: "cpc",
  utmCampaign: "spring",
  turnstileToken: "token-123",
};

describe("inquirySchema", () => {
  it("accepts a complete submission", () => {
    const parsed = inquirySchema.safeParse(validInquiry);
    expect(parsed.success).toBe(true);
  });

  it("accepts a Nepali (Devanagari) name", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      fullName: "सुशील आचार्य",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts accented Latin names", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      fullName: "José Martínez",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects digits inside a name", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      fullName: "Ram 123",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects consent = false", () => {
    const parsed = inquirySchema.safeParse({ ...validInquiry, consent: false });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Please accept the privacy notice"
      );
    }
  });

  it("rejects a missing consent flag", () => {
    const { consent, ...withoutConsent } = validInquiry;
    void consent;
    expect(inquirySchema.safeParse(withoutConsent).success).toBe(false);
  });

  it("accepts a filled honeypot so the action can drop it silently", () => {
    // A field error here would name `website` and teach the bot what to leave blank.
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      website: "http://spam.example",
    });
    expect(parsed.success).toBe(true);
  });

  it("requires a Turnstile token", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      turnstileToken: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("allows an empty optional email", () => {
    expect(inquirySchema.safeParse({ ...validInquiry, email: "" }).success).toBe(true);
    expect(
      inquirySchema.safeParse({ ...validInquiry, email: undefined }).success
    ).toBe(true);
  });

  it("rejects a malformed optional email", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      email: "not-an-email",
    });
    expect(parsed.success).toBe(false);
  });

  it("lowercases the email", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      email: "Ram@Example.COM",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ram@example.com");
  });

  it("defaults preferredBatch to ANY", () => {
    const { preferredBatch, ...withoutBatch } = validInquiry;
    void preferredBatch;
    const parsed = inquirySchema.safeParse(withoutBatch);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.preferredBatch).toBe("ANY");
  });

  it("rejects the old lowercase batch values", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      preferredBatch: "morning",
    });
    expect(parsed.success).toBe(false);
  });

  it("trims the name and phone", () => {
    const parsed = inquirySchema.safeParse({
      ...validInquiry,
      fullName: "  Ram Sharma  ",
      phone: " +977-9800000000 ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fullName).toBe("Ram Sharma");
      expect(parsed.data.phone).toBe("+977-9800000000");
    }
  });
});

describe("NAME_PATTERN", () => {
  it("allows letters, marks, spaces, dots, apostrophes and hyphens", () => {
    expect(NAME_PATTERN.test("Anne-Marie O'Neill Jr.")).toBe(true);
    expect(NAME_PATTERN.test("सुशील आचार्य")).toBe(true);
  });

  it("rejects digits and symbols", () => {
    expect(NAME_PATTERN.test("Ram 42")).toBe(false);
    expect(NAME_PATTERN.test("ram@home")).toBe(false);
  });
});

describe("contactSchema", () => {
  const validContact = {
    name: "Sita Gurung",
    email: "sita@example.com",
    phone: "",
    subject: "Corporate training",
    organization: "Acme Pvt Ltd",
    message: "We would like to train 10 employees in Excel.",
    website: "",
    turnstileToken: "token-456",
  };

  it("accepts a valid message without a phone number", () => {
    const parsed = contactSchema.safeParse({
      ...validContact,
      phone: undefined,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a short message", () => {
    const parsed = contactSchema.safeParse({
      ...validContact,
      message: "hi",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const parsed = contactSchema.safeParse({
      ...validContact,
      email: "sita@",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a filled honeypot so the action can drop it silently", () => {
    expect(
      contactSchema.safeParse({ ...validContact, website: "spam" }).success
    ).toBe(true);
  });
});

describe("leadFilterSchema", () => {
  it("defaults to the all view, newest first, page 1", () => {
    const parsed = leadFilterSchema.parse({});
    expect(parsed.view).toBe("all");
    expect(parsed.sort).toBe("createdAt");
    expect(parsed.dir).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.followUpDue).toBe(false);
  });

  it("coerces the page query string", () => {
    expect(leadFilterSchema.parse({ page: "3" }).page).toBe(3);
  });

  it("falls back to defaults for a garbage page instead of throwing", () => {
    expect(leadFilterSchema.parse({ page: "abc" }).page).toBe(1);
    expect(leadFilterSchema.parse({ status: "NOPE" }).status).toBeUndefined();
    expect(leadFilterSchema.parse({ view: "nope" }).view).toBe("all");
  });

  it("parses the follow-up-due flag from a query string", () => {
    expect(leadFilterSchema.parse({ followUpDue: "true" }).followUpDue).toBe(true);
    expect(leadFilterSchema.parse({ followUpDue: "0" }).followUpDue).toBe(false);
  });

  it("accepts the unassigned assignee filter", () => {
    const parsed = leadFilterSchema.parse({ assignee: "unassigned" });
    expect(parsed.assignee).toBe("unassigned");
  });

  it("exposes the page size used by the table", () => {
    expect(LEAD_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe("lead admin mutations", () => {
  it("requires a reason when a lead is marked LOST", () => {
    const parsed = updateLeadStatusSchema.safeParse({
      id: "abc123",
      status: "LOST",
      lostReason: "",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts LOST with a reason", () => {
    const parsed = updateLeadStatusSchema.safeParse({
      id: "abc123",
      status: "LOST",
      lostReason: "Chose another institute",
    });
    expect(parsed.success).toBe(true);
  });

  it("allows status changes other than LOST without a reason", () => {
    const parsed = updateLeadStatusSchema.safeParse({
      id: "abc123",
      status: "ENROLLED",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(
      updateLeadStatusSchema.safeParse({ id: "abc123", status: "GONE" }).success
    ).toBe(false);
  });

  it("requires at least one id for a bulk action", () => {
    expect(
      bulkLeadActionSchema.safeParse({ ids: [], action: "spam" }).success
    ).toBe(false);
    expect(
      bulkLeadActionSchema.safeParse({ ids: ["a1"], action: "spam" }).success
    ).toBe(true);
  });
});

/**
 * The validators cannot import Prisma (they ship to the browser), so the enum
 * values are duplicated as literals. These assertions fail as soon as the
 * Prisma schema and the client-safe validators drift apart.
 */
describe("validator enum literals match the Prisma schema", () => {
  it("LeadStatus", () => {
    expect([...LEAD_STATUSES].sort()).toEqual(Object.keys(LeadStatus).sort());
  });

  it("LeadSource", () => {
    expect([...LEAD_SOURCES].sort()).toEqual(Object.keys(LeadSource).sort());
  });

  it("PreferredBatch", () => {
    expect([...PREFERRED_BATCHES].sort()).toEqual(
      Object.keys(PreferredBatch).sort()
    );
  });

  it("MessageStatus", () => {
    expect([...MESSAGE_STATUSES].sort()).toEqual(
      Object.keys(MessageStatus).sort()
    );
  });

  it("PublishStatus (course status)", () => {
    expect([...COURSE_STATUSES].sort()).toEqual(
      Object.keys(PublishStatus).sort()
    );
  });

  it("CourseLevel", () => {
    expect([...COURSE_LEVELS].sort()).toEqual(Object.keys(CourseLevel).sort());
  });

  it("LearningMode", () => {
    expect([...LEARNING_MODES].sort()).toEqual(
      Object.keys(LearningMode).sort()
    );
  });

  it("TimeSlot", () => {
    expect([...TIME_SLOTS].sort()).toEqual(Object.keys(TimeSlot).sort());
  });

  it("manual LeadActivityType subset", () => {
    for (const type of MANUAL_ACTIVITY_TYPES) {
      expect(Object.keys(LeadActivityType)).toContain(type);
    }
  });
});

describe("contact admin mutations", () => {
  it("rejects an unknown message status", () => {
    expect(
      updateMessageStatusSchema.safeParse({ id: "m1", status: "PENDING" })
        .success
    ).toBe(false);
    expect(
      updateMessageStatusSchema.safeParse({ id: "m1", status: "READ" }).success
    ).toBe(true);
  });

  it("defaults the contact filter", () => {
    expect(contactFilterSchema.parse({}).page).toBe(1);
  });
});

describe("courseWriteSchema", () => {
  const base = {
    title: "Basic Computer Course",
    slug: "basic-computer-course",
    tagline: "Start from zero",
    shortDescription: "Computer literacy for absolute beginners.",
    categoryId: "clx0000000000000000000000",
    level: "BEGINNER",
    durationWeeks: 4,
    targetStudents: "students, job seekers",
    instituteCertificate: "Darbar Computer Certificate",
    feeNPR: 12000,
    status: "DRAFT",
  };

  it("accepts a minimal course and defaults the lists", () => {
    const parsed = courseWriteSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.skillsGained).toEqual([]);
      expect(parsed.data.learningModes).toEqual([]);
      expect(parsed.data.isFeatured).toBe(false);
      expect(parsed.data.sortOrder).toBe(0);
      expect(parsed.data.overview).toBeNull();
    }
  });

  it("splits comma-separated lists and trims them", () => {
    const parsed = courseWriteSchema.safeParse({
      ...base,
      skillsGained: "Typing, MS Word ,Excel",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.skillsGained).toEqual(["Typing", "MS Word", "Excel"]);
  });

  it("requires a kebab-case slug", () => {
    expect(courseWriteSchema.safeParse({ ...base, slug: "Basic Computer" }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, slug: "basic--computer" }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, slug: "basic-computer" }).success).toBe(true);
  });

  it("rejects a negative fee and a non-integer one", () => {
    expect(courseWriteSchema.safeParse({ ...base, feeNPR: -1 }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, feeNPR: 12.5 }).success).toBe(false);
  });

  it("caps the SEO fields at 60 and 160 characters", () => {
    expect(courseWriteSchema.safeParse({ ...base, seoTitle: "a".repeat(61) }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, seoDescription: "a".repeat(161) }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, seoTitle: "a".repeat(60) }).success).toBe(true);
  });

  it("rejects an unknown enum value", () => {
    expect(courseWriteSchema.safeParse({ ...base, level: "EXPERT" }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, status: "LIVE" }).success).toBe(false);
    expect(courseWriteSchema.safeParse({ ...base, learningModes: ["CARAVAN"] }).success).toBe(false);
  });

  it("reads the isFeatured checkbox and the featured order", () => {
    const parsed = courseWriteSchema.safeParse({ ...base, isFeatured: "on", featuredOrder: "2" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isFeatured).toBe(true);
      expect(parsed.data.featuredOrder).toBe(2);
    }
  });
});

describe("categoryWriteSchema", () => {
  it("defaults to an active, first-in-order category", () => {
    const parsed = categoryWriteSchema.safeParse({
      groupId: "clx1111111111111111111111",
      name: "Basic Computer",
      slug: "basic-computer",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.isActive).toBe(true);
      expect(parsed.data.sortOrder).toBe(0);
    }
  });

  it("rejects a duplicate-style slug", () => {
    expect(
      categoryWriteSchema.safeParse({
        groupId: "clx1111111111111111111111",
        name: "Basic Computer",
        slug: "Basic Computer",
      }).success
    ).toBe(false);
  });
});

describe("courseFilterSchema", () => {
  it("defaults to page 1 with no filters", () => {
    const parsed = courseFilterSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.status).toBeUndefined();
    expect(parsed.featured).toBe(false);
  });

  it("coerces the featured flag and the page from the URL", () => {
    expect(courseFilterSchema.parse({ featured: "1" }).featured).toBe(true);
    expect(courseFilterSchema.parse({ featured: "0" }).featured).toBe(false);
    expect(courseFilterSchema.parse({ page: "3" }).page).toBe(3);
    expect(courseFilterSchema.parse({ page: "nope" }).page).toBe(1);
  });
});

describe("externalMediaSchema", () => {
  const alt = "Students in the DarbarTech computer lab";

  it("accepts a public https URL", () => {
    const parsed = externalMediaSchema.safeParse({
      url: "https://images.example.com/cover.jpg",
      alt,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.url).toBe("https://images.example.com/cover.jpg");
  });

  it("accepts loopback http so local uploads can be pasted", () => {
    expect(
      externalMediaSchema.safeParse({
        url: "http://localhost:3000/uploads/darbar/admin/photo.jpg",
        alt,
      }).success
    ).toBe(true);
    expect(
      externalMediaSchema.safeParse({ url: "http://127.0.0.1:3000/a.png", alt }).success
    ).toBe(true);
  });

  it("rejects http on a public host", () => {
    expect(
      externalMediaSchema.safeParse({ url: "http://images.example.com/a.jpg", alt }).success
    ).toBe(false);
  });

  it("rejects private-network hosts and non-http schemes", () => {
    for (const url of [
      "https://192.168.1.2/uploads/a.jpg",
      "http://192.168.1.2:3000/uploads/a.jpg",
      "https://10.0.0.5/a.jpg",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "/uploads/darbar/admin/a.jpg",
    ]) {
      expect(externalMediaSchema.safeParse({ url, alt }).success, url).toBe(false);
    }
  });

  it("requires alt text and trims it", () => {
    expect(externalMediaSchema.safeParse({ url: "https://a.example/b.jpg", alt: "  " }).success).toBe(false);
    const parsed = externalMediaSchema.safeParse({
      url: "  https://a.example/b.jpg  ",
      alt: `  ${alt}  `,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.url).toBe("https://a.example/b.jpg");
      expect(parsed.data.alt).toBe(alt);
    }
  });
});
describe("assignments", () => {
  it("SubmissionReviewStatus", () => {
    expect([...SUBMISSION_REVIEW_STATUSES].sort()).toEqual(
      Object.keys(SubmissionReviewStatus).sort()
    );
  });

  it("reuses Prisma PublishStatus for assignment status", () => {
    expect([...ASSIGNMENT_STATUSES].sort()).toEqual(Object.keys(PublishStatus).sort());
  });

  it("accepts a well-formed assignment and defaults the optional fields", () => {
    const parsed = assignmentWriteSchema.safeParse({
      courseId: "c1",
      title: "Build a resume",
      status: "PUBLISHED",
      studentIds: ["s1", "s2"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.dueDate).toBeUndefined();
      expect(parsed.data.instructions).toBeUndefined();
      expect(parsed.data.studentIds).toEqual(["s1", "s2"]);
    }
  });

  it("requires at least one recipient — a task nobody is assigned to is a mistake", () => {
    expect(
      assignmentWriteSchema.safeParse({
        courseId: "c1",
        title: "Build a resume",
        status: "PUBLISHED",
        studentIds: [],
      }).success
    ).toBe(false);
  });

  it("rejects a non-https submission link", () => {
    expect(
      submissionWriteSchema.safeParse({ assignmentId: "a1", url: "javascript:alert(1)" }).success
    ).toBe(false);
    expect(
      submissionWriteSchema.safeParse({
        assignmentId: "a1",
        url: " https://github.com/ram/project ",
      }).success
    ).toBe(true);
  });

  it("keeps SUBMITTED out of the instructor review options", () => {
    expect(
      submissionReviewSchema.safeParse({
        assignmentId: "a1",
        submissionId: "s1",
        reviewStatus: "SUBMITTED",
      }).success
    ).toBe(false);
    expect(
      submissionReviewSchema.safeParse({
        assignmentId: "a1",
        submissionId: "s1",
        reviewStatus: "NEEDS_WORK",
        reviewNote: "",
      }).success
    ).toBe(true);
  });
});

describe("notices", () => {
  it("reuses Prisma NoticeType and PublishStatus", () => {
    expect([...NOTICE_TYPES].sort()).toEqual(Object.keys(NoticeType).sort());
    expect([...NOTICE_STATUSES].sort()).toEqual(Object.keys(PublishStatus).sort());
  });

  it("accepts an undated notice, which is an open-ended announcement", () => {
    const parsed = noticeWriteSchema.safeParse({
      type: "ANNOUNCEMENT",
      title: "New DTP batch from Mangsir 15",
      body: "Evening seats are open.",
      startsAt: "",
      endsAt: "",
      status: "PUBLISHED",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a notice that ends before it starts", () => {
    const parsed = noticeWriteSchema.safeParse({
      type: "HOLIDAY",
      title: "Tihar break",
      body: "Institute closed for Tihar.",
      startsAt: "2026-11-08",
      endsAt: "2026-11-01",
      status: "PUBLISHED",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires a body — a popup with only a headline is not a notice", () => {
    expect(
      noticeWriteSchema.safeParse({
        type: "CLOSURE",
        title: "Lab maintenance",
        body: "   ",
        status: "DRAFT",
      }).success
    ).toBe(false);
  });

  it("treats a missing or empty picture as no picture", () => {
    const base = {
      type: "HOLIDAY",
      title: "Dashain break",
      body: "Institute closed for Dashain.",
      status: "DRAFT",
    };
    expect(noticeWriteSchema.parse(base).imageId).toBeNull();
    expect(noticeWriteSchema.parse({ ...base, imageId: "" }).imageId).toBeNull();
    expect(noticeWriteSchema.parse({ ...base, imageId: "clxmedia01" }).imageId).toBe("clxmedia01");
  });
});
