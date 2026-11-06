import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Brief task 9 — the two student data requests.
 *
 * One fake database stands in for Prisma and the real `requireStepUp` runs on top
 * of it, so an action is answered the way the counter would answer it: a
 * permission, then a code, then the reads and writes, then the audit entry. The
 * questions this file asks are the ones a privacy officer would ask:
 *
 *   - does an export contain the student's file and not the staff members' names?
 *   - is a collection cut short reported rather than silently dropped?
 *   - does an erase touch the identity fields and leave the ledger alone?
 *   - does either refusal happen before a single row is read or written?
 *   - does the audit trail record counts and never a name?
 */

type Recorded = Record<string, unknown>;
type Write = { where: Recorded; data: Recorded };

/** The export document, as far as this test needs to reach into it. */
type ExportDocument = {
  kind: string;
  note: string;
  student: Recorded;
  account: Recorded;
  profile: Recorded;
  enquiry: { message: string | null; activities: Recorded[] } & Recorded;
  enrollments: Recorded[];
  invoices: ({ payments: Recorded[] } & Recorded)[];
  certificates: Recorded[];
  portfolioProjects: Recorded[];
  assignmentSubmissions: Recorded[];
  uploads: Recorded[];
  truncated: string[];
};

const reads = vi.hoisted(() => ({
  profile: [] as Record<string, unknown>[],
  enrollments: [] as Record<string, unknown>[],
  invoices: [] as Record<string, unknown>[],
  certificates: [] as Record<string, unknown>[],
  projects: [] as Record<string, unknown>[],
  submissions: [] as Record<string, unknown>[],
  recipients: [] as Record<string, unknown>[],
  uploads: [] as Record<string, unknown>[],
  sessions: [] as Record<string, unknown>[],
  trail: [] as Record<string, unknown>[],
}));

const writes = vi.hoisted(() => ({
  user: [] as Write[],
  profile: [] as Write[],
  projects: [] as Write[],
  submissions: [] as Write[],
  accounts: [] as Write[],
  sessionDeletes: [] as Record<string, unknown>[],
  twoFactorDeletes: [] as Record<string, unknown>[],
  mediaDeletes: [] as Record<string, unknown>[],
  /** How many operations each `$transaction` was handed, in call order. */
  transactionSizes: [] as number[],
}));

const fixture = vi.hoisted(() => ({
  /** Rows per collection the read stubs hand back; one is enough to prove shape. */
  counts: {} as Record<string, number>,
  profile: null as Record<string, unknown> | null,
  /** The stored picture is the last thing to go, and it may fail to go. */
  mediaDeleteThrows: false,
}));

const sessionState = vi.hoisted(() => ({
  userId: "admin-1",
  email: "admin@darbar.test",
  role: "SUPER_ADMIN",
  twoFactorEnabled: true,
  denied: [] as string[],
}));

const twoFactorState = vi.hoisted(() => ({ failWith: null as string | null }));

const auditCalls = vi.hoisted(
  () =>
    [] as {
      action: string;
      entity: string;
      entityId?: string | null;
      summary?: string;
      meta?: unknown;
      actor?: { id: string | null; email: string };
    }[]
);

const destroyed = vi.hoisted(() => [] as string[]);
const invalidated = vi.hoisted(() => [] as string[]);

/** `requireStepUp` reads a code out of the payload; the verifier is faked below. */
vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      verifyTOTP: async () => {
        if (twoFactorState.failWith) {
          throw Object.assign(new Error("Invalid code"), { body: { code: twoFactorState.failWith } });
        }
        return { verified: true };
      },
      verifyBackupCode: async () => ({ valid: true }),
    },
  },
}));

vi.mock("@/server/services/signin-guard", () => ({
  createSigninGuard: () => ({
    checkGate: async () => "allowed",
    recordFailure: async () => {},
    recordWrongPortal: async () => {},
  }),
}));

vi.mock("@/server/services/rate-limit", () => ({
  getClientIpHash: async () => "ip-hash",
  getClientIp: async () => "127.0.0.1",
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/server/session", () => ({
  isRedirectError: () => false,
  requirePermission: async (action: string) => {
    if (sessionState.denied.includes(action)) {
      throw Object.assign(new Error(`FORBIDDEN: missing permission ${action}`), {
        code: "FORBIDDEN",
      });
    }
    return {
      id: sessionState.userId,
      email: sessionState.email,
      name: "Super Admin",
      role: sessionState.role,
      twoFactorEnabled: sessionState.twoFactorEnabled,
    };
  },
}));

vi.mock("@/server/services/audit", () => ({
  audit: async (input: (typeof auditCalls)[number]) => {
    auditCalls.push(input);
  },
}));

vi.mock("@/server/services/storage", () => ({
  destroyAsset: async (publicId: string) => {
    destroyed.push(publicId);
  },
}));

vi.mock("@/server/revalidate", () => ({
  invalidate: (...tags: string[]) => invalidated.push(...tags),
  STUDENT_TAGS: ["students"],
  USER_TAGS: ["users"],
  PORTFOLIO_TAGS: ["portfolio"],
}));

const list = (name: string, make: (index: number) => Record<string, unknown>) =>
  Array.from({ length: fixture.counts[name] ?? 1 }, (_, index) => make(index));

vi.mock("@/server/db", () => ({
  db: {
    studentProfile: {
      findUnique: async (args: Record<string, unknown>) => {
        reads.profile.push(args);
        return fixture.profile;
      },
      updateMany: async (write: Write) => {
        writes.profile.push(write);
        return { count: 1 };
      },
    },
    user: {
      updateMany: async (write: Write) => {
        writes.user.push(write);
        return { count: 1 };
      },
    },
    enrollment: {
      findMany: async (args: Record<string, unknown>) => {
        reads.enrollments.push(args);
        return list("enrollments", (i) => ({
          id: `enr-${i}`,
          studentId: "stu-1",
          courseId: "crs-1",
          status: "ACTIVE",
          // The staff columns, throughout: whose button moved this record.
          decidedById: "staff-1",
          course: { title: "AutoCAD 2D", slug: "autocad-2d" },
          batch: {
            name: "Morning 2026",
            startDate: new Date("2026-01-05"),
            timeSlot: "MORNING",
            status: "ONGOING",
          },
        }));
      },
    },
    invoice: {
      findMany: async (args: Record<string, unknown>) => {
        reads.invoices.push(args);
        return list("invoices", (i) => ({
          id: `inv-${i}`,
          number: `INV-${i}`,
          netAmount: 15000,
          createdById: "staff-1",
          installments: [{ id: `ins-${i}`, invoiceId: `inv-${i}`, seq: 1, amount: 15000 }],
          payments: [
            {
              id: `pay-${i}`,
              invoiceId: `inv-${i}`,
              receiptNo: `RCPT-${i}`,
              amount: 15000,
              receivedById: "staff-2",
              voidedById: null,
            },
          ],
        }));
      },
    },
    certificate: {
      findMany: async (args: Record<string, unknown>) => {
        reads.certificates.push(args);
        return list("certificates", (i) => ({
          id: `cet-${i}`,
          certificateNumber: `DT-${i}`,
          recipientName: "Sita Sharma",
          createdById: "staff-1",
          items: [{ id: `itm-${i}`, certificateId: `cet-${i}`, title: "AutoCAD 2D" }],
        }));
      },
    },
    portfolioProject: {
      findMany: async (args: Record<string, unknown>) => {
        reads.projects.push(args);
        return list("projects", (i) => ({
          id: `prj-${i}`,
          studentId: "stu-1",
          title: `Project ${i}`,
          coverId: null,
          cover: null,
        }));
      },
      updateMany: async (write: Write) => {
        writes.projects.push(write);
        return { count: 4 };
      },
    },
    assignmentSubmission: {
      findMany: async (args: Record<string, unknown>) => {
        reads.submissions.push(args);
        return list("submissions", (i) => ({
          id: `sub-${i}`,
          studentId: "stu-1",
          url: "https://github.com/sita/tower",
          reviewNote: "Neat layering.",
          reviewedById: "staff-3",
          assignment: { id: "asg-1", title: "Tower drawing", dueDate: null, courseId: "crs-1" },
        }));
      },
      updateMany: async (write: Write) => {
        writes.submissions.push(write);
        return { count: 2 };
      },
    },
    assignmentRecipient: {
      findMany: async (args: Record<string, unknown>) => {
        reads.recipients.push(args);
        return list("recipients", (i) => ({
          id: `rcp-${i}`,
          studentId: "stu-1",
          seenAt: null,
          assignment: { id: "asg-1", title: "Tower drawing", dueDate: null, status: "PUBLISHED" },
        }));
      },
    },
    media: {
      findMany: async (args: Record<string, unknown>) => {
        reads.uploads.push(args);
        return list("uploads", (i) => ({
          id: `med-${i}`,
          url: "/uploads/student.png",
          publicId: `student-${i}`,
          uploadedById: "user-1",
        }));
      },
      delete: async (args: Record<string, unknown>) => {
        if (fixture.mediaDeleteThrows) throw new Error("Foreign key constraint");
        writes.mediaDeletes.push(args);
        return { id: "med-photo" };
      },
    },
    session: {
      findMany: async (args: Record<string, unknown>) => {
        reads.sessions.push(args);
        return list("sessions", (i) => ({
          id: `ses-${i}`,
          userId: "user-1",
          ipAddress: "203.0.113.9",
          userAgent: "Mozilla/5.0",
          expiresAt: new Date("2026-12-01"),
          createdAt: new Date("2026-11-01"),
          updatedAt: new Date("2026-11-01"),
        }));
      },
      deleteMany: async (args: Record<string, unknown>) => {
        writes.sessionDeletes.push(args);
        return { count: 3 };
      },
    },
    auditLog: {
      findMany: async (args: Record<string, unknown>) => {
        reads.trail.push(args);
        return list("trail", (i) => ({
          createdAt: new Date("2026-11-02"),
          action: "student.approve",
          entity: "StudentProfile",
          entityId: "stu-1",
          summary: "Approved student registration",
          meta: null,
          id: `aud-${i}`,
        }));
      },
    },
    account: {
      updateMany: async (write: Write) => {
        writes.accounts.push(write);
        return { count: 1 };
      },
    },
    twoFactor: {
      deleteMany: async (args: Record<string, unknown>) => {
        writes.twoFactorDeletes.push(args);
        return { count: 1 };
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => {
      writes.transactionSizes.push(operations.length);
      return Promise.all(operations);
    },
  },
  prisma: {},
}));

const { exportStudentDataAction, eraseStudentDataAction } = await import(
  "@/server/actions/student-privacy"
);
const {
  ERASED_NAME,
  ERASED_PROJECT_TITLE,
  ERASED_URL,
  EXPORT_ROWS_PER_COLLECTION,
  erasedEmail,
} = await import("@/server/dal/student-privacy");
const { STEP_UP_REQUIRED } = await import("@/server/services/step-up");

const STUDENT_ID = "stu-1";
const DEFAULT_COUNTS = {
  enrollments: 1,
  invoices: 1,
  certificates: 1,
  projects: 1,
  submissions: 1,
  recipients: 1,
  uploads: 1,
  sessions: 1,
  trail: 1,
};

/** The row `studentProfile.findUnique` answers with, includes and all. */
function seedProfile() {
  fixture.profile = {
    id: STUDENT_ID,
    userId: "user-1",
    studentCode: "DT-STU-2026-00042",
    phone: "9812345678",
    dateOfBirth: new Date("2002-04-19"),
    address: "Kathmandu, Tokha",
    city: "Kathmandu",
    country: "Nepal",
    headline: "Civil engineering student",
    bio: "I draw towers.",
    skills: ["AutoCAD"],
    interests: ["Structures"],
    githubUrl: "https://github.com/sita",
    linkedinUrl: null,
    websiteUrl: null,
    photoId: "med-photo",
    portfolioSlug: "sita-sharma",
    portfolioPublic: true,
    approvalStatus: "APPROVED",
    reviewedAt: new Date("2026-11-02"),
    reviewedById: "staff-1",
    rejectionReason: null,
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-11-04"),
    user: {
      id: "user-1",
      name: "Sita Sharma",
      email: "sita@example.test",
      emailVerified: true,
      image: null,
      role: "STUDENT",
      isActive: true,
      lastLoginAt: new Date("2026-11-04"),
      twoFactorEnabled: false,
      createdAt: new Date("2026-10-01"),
      updatedAt: new Date("2026-11-04"),
    },
    photo: {
      id: "med-photo",
      source: "UPLOAD",
      url: "/uploads/sita.png",
      publicId: "students/sita",
      uploadedById: "user-1",
    },
    lead: {
      id: "lead-1",
      fullName: "Sita Sharma",
      phone: "9812345678",
      email: "sita@example.test",
      message: "I want to join the CAD batch.",
      ipHash: "abcd",
      status: "ENROLLED",
      studentId: STUDENT_ID,
      assignedToId: "staff-4",
      createdAt: new Date("2026-09-20"),
      activities: [{ id: "act-1", leadId: "lead-1", body: "Called about fees.", actorId: "staff-4" }],
    },
  };
}

const CODE = { stepUpCode: "123456", stepUpMethod: "totp" as const };

async function exportDocument(input: unknown): Promise<ExportDocument> {
  const result = await exportStudentDataAction(input);
  if (!result.ok) throw new Error(`export was refused: ${result.error}`);
  return result.data.document as ExportDocument;
}

beforeEach(() => {
  for (const bucket of Object.values(reads)) bucket.length = 0;
  writes.user.length = 0;
  writes.profile.length = 0;
  writes.projects.length = 0;
  writes.submissions.length = 0;
  writes.accounts.length = 0;
  writes.sessionDeletes.length = 0;
  writes.twoFactorDeletes.length = 0;
  writes.mediaDeletes.length = 0;
  writes.transactionSizes.length = 0;
  fixture.counts = { ...DEFAULT_COUNTS };
  fixture.mediaDeleteThrows = false;
  sessionState.role = "SUPER_ADMIN";
  sessionState.twoFactorEnabled = true;
  sessionState.denied = [];
  twoFactorState.failWith = null;
  auditCalls.length = 0;
  destroyed.length = 0;
  invalidated.length = 0;
  seedProfile();
});

describe("exportStudentDataAction", () => {
  it("refuses a role that does not hold the export permission", async () => {
    sessionState.denied = ["student.export"];
    const result = await exportStudentDataAction({ id: STUDENT_ID, ...CODE });
    // A denied permission is a thrown error the action swallows into the generic
    // failure; what matters is that nothing was read.
    expect(result.ok).toBe(false);
    expect(reads.profile).toHaveLength(0);
  });

  it("refuses without a fresh code, before reading a single row", async () => {
    const result = await exportStudentDataAction({ id: STUDENT_ID });
    expect(result).toEqual({ ok: false, error: STEP_UP_REQUIRED });
    expect(reads.profile).toHaveLength(0);
    expect(reads.invoices).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it("refuses a wrong code and still reads nothing", async () => {
    twoFactorState.failWith = "invalid";
    const result = await exportStudentDataAction({ id: STUDENT_ID, stepUpCode: "000000" });
    expect(result.ok).toBe(false);
    expect(reads.profile).toHaveLength(0);
  });

  it("answers an unknown student without a file", async () => {
    fixture.profile = null;
    const result = await exportStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result).toEqual({ ok: false, error: "Student not found" });
  });

  it("names the file after the student code the export is about", async () => {
    const result = await exportStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result.ok && result.data.filename).toBe("darbar-student-DT-STU-2026-00042.json");
  });

  it("reads every collection the student appears in, each one capped", async () => {
    await exportStudentDataAction({ id: STUDENT_ID, ...CODE });

    expect(reads.profile).toHaveLength(1);
    // One read per collection, all asked for one row more than the cap so a cut
    // can be reported instead of quietly missing.
    for (const bucket of [
      reads.enrollments,
      reads.invoices,
      reads.certificates,
      reads.projects,
      reads.submissions,
      reads.recipients,
      reads.uploads,
      reads.sessions,
      reads.trail,
    ]) {
      expect(bucket).toHaveLength(1);
      expect(bucket[0]).toEqual(
        expect.objectContaining({ take: EXPORT_ROWS_PER_COLLECTION + 1 })
      );
    }

    // The uploads are theirs by authorship, the sign-ins by account.
    expect(reads.uploads[0]?.where).toEqual({ uploadedById: "user-1" });
    expect(reads.sessions[0]?.where).toEqual({ userId: "user-1" });
  });

  it("hands over the profile, the enquiry and the receipts the money was written on", async () => {
    const document = await exportDocument({ id: STUDENT_ID, ...CODE });

    expect(document.kind).toBe("darbar.tech/student-data-export");
    expect(document.student).toEqual({
      id: STUDENT_ID,
      studentCode: "DT-STU-2026-00042",
      createdAt: new Date("2026-10-01").toISOString(),
      updatedAt: new Date("2026-11-04").toISOString(),
    });
    expect(document.profile.phone).toBe("9812345678");
    expect(document.profile.photoUrl).toBe("/uploads/sita.png");
    expect(document.enquiry.message).toBe("I want to join the CAD batch.");
    expect(document.enquiry.activities).toHaveLength(1);
    expect(document.invoices[0]?.payments[0]).toMatchObject({ receiptNo: "RCPT-0" });
    expect(document.certificates[0]?.recipientName).toBe("Sita Sharma");
    expect(document.portfolioProjects[0]?.title).toBe("Project 0");
    expect(document.truncated).toEqual([]);
  });

  it("leaves out the staff identities and the institute's own security posture", async () => {
    const document = await exportDocument({ id: STUDENT_ID, ...CODE });

    // Whether this account has an authenticator is the institute's business, and
    // whose buttons moved the record is readable in the admin audit screen.
    expect(Object.keys(document.account)).not.toContain("role");
    expect(Object.keys(document.account)).not.toContain("twoFactorEnabled");
    expect(document.account.email).toBe("sita@example.test");

    expect(Object.keys(document.enrollments[0] ?? {})).not.toContain("decidedById");
    expect(Object.keys(document.invoices[0] ?? {})).not.toContain("createdById");
    expect(Object.keys(document.invoices[0]?.payments[0] ?? {})).not.toContain("receivedById");
    expect(Object.keys(document.certificates[0] ?? {})).not.toContain("createdById");
    expect(Object.keys(document.assignmentSubmissions[0] ?? {})).not.toContain("reviewedById");
    expect(Object.keys(document.uploads[0] ?? {})).not.toContain("uploadedById");
    expect(Object.keys(document.enquiry)).not.toContain("assignedToId");
    expect(Object.keys(document.enquiry.activities[0] ?? {})).not.toContain("actorId");
  });

  it("asks the audit trail only for what happened to this student", async () => {
    await exportStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(reads.trail[0]?.where).toEqual({
      OR: [
        { entity: "StudentProfile", entityId: STUDENT_ID },
        { entity: "User", entityId: "user-1" },
      ],
    });
    // The select is what keeps the staff identity out of the file.
    expect(reads.trail[0]?.select).not.toHaveProperty("actorId");
  });

  it("reports a collection it had to cut short instead of hiding it", async () => {
    fixture.counts.invoices = EXPORT_ROWS_PER_COLLECTION + 7;
    const document = await exportDocument({ id: STUDENT_ID, ...CODE });
    expect(document.truncated).toEqual(["invoices"]);
    expect(document.invoices).toHaveLength(EXPORT_ROWS_PER_COLLECTION);
  });

  it("carries no student identity into the audit entry", async () => {
    await exportStudentDataAction({ id: STUDENT_ID, ...CODE });

    const entry = auditCalls.find((call) => call.action === "student.export");
    expect(entry).toMatchObject({
      entity: "StudentProfile",
      entityId: STUDENT_ID,
      actor: { id: "admin-1", email: "admin@darbar.test" },
    });
    expect(entry?.meta).toEqual({
      enrollments: 1,
      invoices: 1,
      certificates: 1,
      projects: 1,
      submissions: 1,
      assignments: 1,
      uploads: 1,
      sessions: 1,
      trail: 1,
    });
    expect(JSON.stringify(entry?.meta)).not.toContain("Sita");
    expect(JSON.stringify(entry?.meta)).not.toContain("9812345678");
  });

  it("confirms the second factor in its own audit entry, never with the digits", async () => {
    await exportStudentDataAction({ id: STUDENT_ID, ...CODE });
    const stepUp = auditCalls.find((call) => call.action === "auth.2fa.stepUp");
    expect(stepUp?.meta).toEqual({ purpose: "student.export", method: "totp" });
    expect(JSON.stringify(auditCalls)).not.toContain("123456");
  });

  it("exports a student with no enquiry at all", async () => {
    const seeded = fixture.profile as Record<string, unknown>;
    seeded.lead = null;
    const document = await exportDocument({ id: STUDENT_ID, ...CODE });
    expect(document.enquiry).toBeNull();
    expect(document.account.name).toBe("Sita Sharma");
  });
});

describe("eraseStudentDataAction", () => {
  it("refuses without a code, and writes nothing", async () => {
    const result = await eraseStudentDataAction({ id: STUDENT_ID });
    expect(result).toEqual({ ok: false, error: STEP_UP_REQUIRED });
    expect(writes.user).toHaveLength(0);
    expect(writes.profile).toHaveLength(0);
    expect(auditCalls).toHaveLength(0);
  });

  it("refuses an erase permission it does not have", async () => {
    sessionState.denied = ["student.erase"];
    const result = await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result.ok).toBe(false);
    expect(writes.profile).toHaveLength(0);
  });

  it("answers an unknown student without touching anything", async () => {
    fixture.profile = null;
    const result = await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result).toEqual({ ok: false, error: "Student not found" });
    expect(writes.transactionSizes).toHaveLength(0);
  });

  it("rewrites the account, the profile, the portfolio and the links in one transaction", async () => {
    const result = await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result.ok).toBe(true);

    // One transaction, so a crash halfway cannot leave the email gone and the
    // phone still on the row.
    expect(writes.transactionSizes).toEqual([7]);

    expect(writes.user[0]).toEqual({
      where: { id: "user-1" },
      data: {
        name: ERASED_NAME,
        email: erasedEmail(STUDENT_ID),
        image: null,
        isActive: false,
        lastLoginAt: null,
      },
    });

    const profileData = writes.profile[0]?.data as Recorded;
    for (const field of [
      "phone",
      "dateOfBirth",
      "address",
      "city",
      "country",
      "headline",
      "bio",
      "skills",
      "interests",
      "githubUrl",
      "linkedinUrl",
      "websiteUrl",
      "photoId",
      "portfolioSlug",
      "rejectionReason",
    ]) {
      expect(profileData, `${field} must be cleared`).toHaveProperty(field);
    }
    expect(profileData.portfolioPublic).toBe(false);
    expect(profileData.skills).toEqual([]);
    expect(profileData.interests).toEqual([]);
  });

  it("keeps the reference the ledger was written against", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    const profileData = writes.profile[0]?.data as Recorded;
    // The code is not an identity — it is how invoice DT-STU-2026-00042 is found.
    expect(profileData).not.toHaveProperty("studentCode");
    expect(profileData).not.toHaveProperty("approvalStatus");
    expect(writes.user[0]?.data).not.toHaveProperty("role");
  });

  it("unpublishes the portfolio work and blanks the submission links", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(writes.projects[0]).toEqual({
      where: { studentId: STUDENT_ID },
      data: {
        title: ERASED_PROJECT_TITLE,
        description: null,
        techStack: [],
        liveUrl: null,
        repoUrl: null,
        coverId: null,
        isPublished: false,
      },
    });
    expect(writes.submissions[0]).toEqual({
      where: { studentId: STUDENT_ID },
      data: { url: ERASED_URL, reviewNote: null },
    });
  });

  it("signs the account out and takes the credential with it", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(writes.sessionDeletes).toEqual([{ where: { userId: "user-1" } }]);
    expect(writes.twoFactorDeletes).toEqual([{ where: { userId: "user-1" } }]);
    expect(writes.accounts[0]?.data).toEqual({
      password: null,
      accessToken: null,
      refreshToken: null,
      idToken: null,
    });
  });

  it("deletes the uploaded picture and its stored file", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(writes.mediaDeletes).toEqual([{ where: { id: "med-photo" } }]);
    expect(destroyed).toEqual(["students/sita"]);
  });

  it("leaves a stock placeholder image on disk but off the record", async () => {
    (fixture.profile as Recorded).photo = {
      id: "med-photo",
      source: "EXTERNAL",
      url: "https://picsum.photos/lab",
      publicId: null,
    };
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    // The row goes — the profile no longer points at it, and that is the erasure.
    // A file this institute does not host is not its to delete.
    expect(writes.mediaDeletes).toEqual([{ where: { id: "med-photo" } }]);
    expect(destroyed).toEqual([]);
  });

  it("still reports success when the stored file cannot be reached", async () => {
    fixture.mediaDeleteThrows = true;
    const result = await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(result).toEqual({ ok: true, data: { id: STUDENT_ID } });
    expect(destroyed).toEqual([]);
    expect(writes.profile).toHaveLength(1);
  });

  it("deletes no row of any kind, because the money points at this profile", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    // `Invoice.studentId` is Restrict precisely so an erase has to be a rewrite.
    expect(writes.transactionSizes[0]).toBe(7);
    expect(writes.profile[0]?.where).toEqual({ id: STUDENT_ID });
    expect(writes.mediaDeletes).toEqual([{ where: { id: "med-photo" } }]);
  });

  it("invalidates the student, user and portfolio caches", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    expect(invalidated).toEqual(["students", "users", "portfolio"]);
  });

  it("audits the erase with counts only", async () => {
    await eraseStudentDataAction({ id: STUDENT_ID, ...CODE });
    const entry = auditCalls.find((call) => call.action === "student.erase");
    expect(entry?.summary).toBe("Erased a student's identity; financial records kept");
    expect(entry?.meta).toEqual({
      fieldsCleared: 2,
      projectsCleared: 4,
      submissionsCleared: 2,
      sessionsRevoked: 3,
      credentialsCleared: 1,
      twoFactorCleared: 1,
      photoRemoved: true,
    });
    const trail = JSON.stringify(auditCalls);
    expect(trail).not.toContain("Sita");
    expect(trail).not.toContain("9812345678");
    expect(trail).not.toContain("sita@example.test");
    expect(trail).not.toContain("123456");
  });
});

describe("the erased placeholders", () => {
  it("give a mailbox that can never receive mail and never collides", () => {
    expect(erasedEmail("stu-1")).toBe("erased-stu-1@erased.invalid");
    expect(erasedEmail("stu-2")).not.toBe(erasedEmail("stu-1"));
  });

  it("give a link that can never resolve to somebody's page", () => {
    expect(ERASED_URL).toBe("https://erased.invalid/");
  });
});
