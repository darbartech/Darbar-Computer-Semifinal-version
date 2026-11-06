import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §12 asks for the certificate lifecycle under test: issue, revoke and
 * reissue are state transitions, and the only thing that makes them safe is that
 * each write is conditional on the state the admin saw. A dialog that clicks
 * twice, a revoke that races a reissue, and a reissue that would briefly leave
 * the graduate with no live document all have to fail the same way — one row
 * moved, the other told to refresh.
 *
 * The stand-in below reproduces the guarded `updateMany … WHERE status IN (…)`
 * instead of the SQL, so a transition set widened by accident fails here.
 */

type ModuleRow = {
  order: number;
  title: string;
  subtitle: string | null;
  shortLabel: string | null;
};

type SignatoryRow = {
  id: string;
  certificateId: string;
  signatoryId: string | null;
  name: string;
  title: string;
  designation: string;
  displayOrder: number;
};

type CertRow = {
  id: string;
  status: string;
  certificateNumber: string | null;
  verificationToken: string | null;
  recipientName: string;
  recipientIdNumber: string | null;
  studentId: string | null;
  courseId: string | null;
  templateId: string | null;
  createdById: string | null;
  parentCertificateId: string | null;
  courseName: string | null;
  completionDate: Date | null;
  grade: string | null;
  programDuration: string | null;
  issueDate: Date | null;
  issuedAt: Date | null;
  pdfUrl: string | null;
  revokedAt: Date | null;
  revokeCategory: string | null;
  revokeReason: string | null;
  reissuedAt: Date | null;
  reissueReason: string | null;
  metadata: unknown;
  items: ModuleRow[];
  issuedSignatories: SignatoryRow[];
};

const store = vi.hoisted(() => ({
  rows: [] as unknown[],
  counters: new Map<string, number>(),
  created: [] as unknown[],
}));

function fourModules(): ModuleRow[] {
  return [0, 1, 2, 3].map((order) => ({
    order,
    title: `Module ${order + 1}`,
    subtitle: null,
    shortLabel: null,
  }));
}

function certificateRow(overrides: Partial<CertRow> = {}): CertRow {
  return {
    id: "cert-1",
    status: "DRAFT",
    certificateNumber: null,
    verificationToken: null,
    recipientName: "Ram Sharma",
    recipientIdNumber: "DT-STU-2026-00004",
    studentId: "stu-1",
    courseId: "course-1",
    templateId: "tpl-1",
    createdById: "user-admin",
    parentCertificateId: null,
    courseName: "Digital Literacy Essentials",
    completionDate: new Date("2026-09-01T00:00:00.000Z"),
    grade: "A",
    programDuration: "12 weeks",
    issueDate: null,
    issuedAt: null,
    pdfUrl: null,
    revokedAt: null,
    revokeCategory: null,
    revokeReason: null,
    reissuedAt: null,
    reissueReason: null,
    metadata: {},
    items: fourModules(),
    issuedSignatories: [],
    ...overrides,
  };
}

function row(id: string): CertRow {
  const found = store.rows.find((candidate) => (candidate as CertRow).id === id) as
    | CertRow
    | undefined;
  if (!found) throw new Error(`no certificate row ${id} in the fixture`);
  return found;
}

/** The `where` shapes these three writes use, and nothing else. */
function matchesWhere(candidate: CertRow, where: Record<string, unknown>): boolean {
  if (where.id !== undefined && candidate.id !== where.id) return false;
  const status = where.status as string | { in?: string[] } | undefined;
  if (typeof status === "string") {
    if (candidate.status !== status) return false;
  } else if (status && Array.isArray(status.in)) {
    if (!status.in.includes(candidate.status)) return false;
  }
  if (where.studentId !== undefined && candidate.studentId !== where.studentId) return false;
  return true;
}

let nextRowId = 1;

/** What the reissue `create` call carries: scalars plus nested `connect`/`create`. */
type CreateData = {
  status: string;
  certificateNumber: string;
  verificationToken: string;
  recipientName: string;
  recipientIdNumber?: string | null;
  courseName?: string | null;
  completionDate?: Date | null;
  grade?: string | null;
  programDuration?: string | null;
  issueDate?: Date | null;
  issuedAt?: Date | null;
  pdfUrl?: string | null;
  metadata?: unknown;
  student?: { connect?: { id?: string } };
  course?: { connect?: { id?: string } };
  template?: { connect?: { id?: string } };
  createdBy?: { connect?: { id?: string } };
  parentCertificate?: { connect?: { id?: string } };
  items?: { create: ModuleRow[] };
  issuedSignatories?: {
    create: Array<{
      signatoryId?: string | null;
      name: string;
      title: string;
      designation: string;
      displayOrder: number;
    }>;
  };
};

function fromCreateData(data: CreateData): CertRow {
  const id = `cert-new-${nextRowId++}`;
  const connected = (relation?: { connect?: { id?: string } }): string | null =>
    relation?.connect?.id ?? null;

  const row: CertRow = {
    ...certificateRow(),
    id,
    status: data.status,
    certificateNumber: data.certificateNumber,
    verificationToken: data.verificationToken,
    recipientName: data.recipientName,
    recipientIdNumber: data.recipientIdNumber ?? null,
    studentId: connected(data.student),
    courseId: connected(data.course),
    templateId: connected(data.template),
    createdById: connected(data.createdBy),
    parentCertificateId: connected(data.parentCertificate),
    courseName: data.courseName ?? null,
    completionDate: data.completionDate ?? null,
    grade: data.grade ?? null,
    programDuration: data.programDuration ?? null,
    issueDate: data.issueDate ?? null,
    issuedAt: data.issuedAt ?? null,
    pdfUrl: data.pdfUrl ?? null,
    metadata: data.metadata ?? {},
    items: data.items?.create ?? [],
    issuedSignatories: (data.issuedSignatories?.create ?? []).map((signatory, index) => ({
      ...signatory,
      signatoryId: signatory.signatoryId ?? null,
      id: `${id}-sig-${index}`,
      certificateId: id,
    })),
  };
  store.rows.push(row);
  return row;
}

/** Prisma hands back exactly the selected keys, and nothing else. */
function project(row: CertRow, select: Record<string, unknown> | undefined) {
  if (!select) return { ...row };
  const picked: Record<string, unknown> = {};
  for (const [key, wanted] of Object.entries(select)) {
    if (wanted) picked[key] = (row as unknown as Record<string, unknown>)[key];
  }
  return picked;
}

const client = {
  certificate: {
    findUnique: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      const found = store.rows.find((candidate) =>
        matchesWhere(candidate as CertRow, where)
      ) as CertRow | undefined;
      return found ? project(found, select) : null;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => {
      const found = store.rows.find((candidate) =>
        matchesWhere(candidate as CertRow, where)
      ) as CertRow | undefined;
      return found ? project(found, select) : null;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => {
      const hits = store.rows.filter((candidate) =>
        matchesWhere(candidate as CertRow, where)
      ) as CertRow[];
      for (const hit of hits) Object.assign(hit, data);
      return { count: hits.length };
    },
    create: async ({ data }: { data: CreateData }) => {
      const created = fromCreateData(data);
      store.created.push(created);
      return { id: created.id };
    },
  },
  certificateItem: {
    count: async ({ where }: { where: { certificateId: string } }) =>
      row(where.certificateId).items.length,
  },
  certificateIssuedSignatory: {
    deleteMany: async ({ where }: { where: { certificateId: string } }) => {
      const target = row(where.certificateId);
      target.issuedSignatories = [];
      return { count: 0 };
    },
    createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
      for (const signatory of data) {
        const target = row(String(signatory.certificateId));
        target.issuedSignatories.push({
          ...(signatory as unknown as SignatoryRow),
          id: `${target.id}-sig-${target.issuedSignatories.length}`,
        });
      }
      return { count: data.length };
    },
  },
  /**
   * `Counter` is handed out by one atomic `INSERT … ON CONFLICT … RETURNING`, so
   * the fake answers from the same statement shape: a read that then writes is
   * the race the real code refuses to have.
   */
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?");
    const key = String(values[0]);
    if (sql.includes(`INSERT INTO "Counter"`)) {
      const value = (store.counters.get(key) ?? 0) + 1;
      store.counters.set(key, value);
      return [{ value }];
    }
    if (sql.includes(`SELECT "value" FROM "Counter"`)) {
      const value = store.counters.get(key);
      return value === undefined ? [] : [{ value }];
    }
    throw new Error(`Unexpected raw SQL in the certificate path: ${sql}`);
  },
};

vi.mock("@/server/db", () => ({
  db: {
    ...client,
    $transaction: async (fn: (tx: typeof client) => Promise<unknown>) => fn(client),
  },
}));

/** The cache wrapper belongs to Next; which reads are cached is not the point here. */
vi.mock("@/server/cache", () => ({
  cached: (_tags: readonly string[], fn: (...args: never[]) => Promise<unknown>) => fn,
}));

/** The signed-in student, and what "serve the file" means, are both stand-ins. */
const session = vi.hoisted(() => ({ profileId: "stu-1" }));

vi.mock("@/server/student-session", () => ({
  requireStudentProfile: async () => ({
    user: { id: `user-${session.profileId}`, email: `${session.profileId}@example.test` },
    profile: { id: session.profileId },
  }),
}));

const served = vi.hoisted(() => [] as Array<{ id: string; certificateNumber: string }>);

vi.mock("@/server/certificates/pdf/serve", () => ({
  serveCertificatePdf: async (id: string, meta: { certificateNumber: string }) => {
    served.push({ id, certificateNumber: meta.certificateNumber });
    return new Response("pdf", { status: 200 });
  },
}));

const {
  issueCertificate,
  reissueCertificate,
  revokeCertificate,
} = await import("@/server/dal/certificates/certificates.dal");
const { getStudentCertificateDownloadMeta } = await import("@/server/dal/students");
const { GET: downloadForStudent } = await import(
  "@/app/api/student/certificates/[id]/download/route"
);

const SIGNATORIES = [
  { signatoryId: "sig-1", name: "Sita Karki", title: "Director", designation: "Institute", displayOrder: 0 },
  { signatoryId: null, name: "Hari Thapa", title: "Principal", designation: "Institute", displayOrder: 1 },
];

beforeEach(() => {
  store.rows = [];
  store.counters = new Map();
  store.created = [];
  nextRowId = 1;
});

describe("issuing", () => {
  beforeEach(() => {
    store.rows = [certificateRow()];
  });

  it("mints the number and the verification token on the server", async () => {
    const issued = await issueCertificate({ id: "cert-1", issuedSignatories: SIGNATORIES });

    expect(issued).not.toBeNull();
    const saved = row("cert-1");
    expect(saved.status).toBe("ISSUED");
    expect(saved.certificateNumber).toMatch(/^DT-CERT-\d{4}-\d{5}-[A-Z2-9]{4}$/);
    // 24 random bytes, base64url: the token is the second factor of /verify.
    expect(saved.verificationToken).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(saved.issuedAt).toBeInstanceOf(Date);
    expect(issued?.certificateNumber).toBe(saved.certificateNumber);
    expect(issued?.verificationToken).toBe(saved.verificationToken);
  });

  it("issues from PENDING_ISSUE as well as from DRAFT", async () => {
    store.rows = [certificateRow({ id: "cert-2", status: "PENDING_ISSUE" })];
    const issued = await issueCertificate({ id: "cert-2", issuedSignatories: SIGNATORIES });
    expect(issued?.status).toBe("ISSUED");
    expect(row("cert-2").status).toBe("ISSUED");
  });

  it("keeps a number and token a legacy draft already carries", async () => {
    store.rows = [
      certificateRow({
        certificateNumber: "DT-CERT-2025-00001-K7Q2",
        verificationToken: "legacylegacylegacylegacylegacy12",
      }),
    ];
    await issueCertificate({ id: "cert-1", issuedSignatories: SIGNATORIES });
    expect(row("cert-1").certificateNumber).toBe("DT-CERT-2025-00001-K7Q2");
    expect(row("cert-1").verificationToken).toBe("legacylegacylegacylegacylegacy12");
  });

  it("gives two admins clicking Issue together exactly one certificate", async () => {
    const [first, second] = await Promise.all([
      issueCertificate({ id: "cert-1", issuedSignatories: SIGNATORIES }),
      issueCertificate({ id: "cert-1", issuedSignatories: SIGNATORIES }),
    ]);

    const winners = [first, second].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(row("cert-1").status).toBe("ISSUED");
  });

  it("refuses to re-issue what is already issued, revoked or superseded", async () => {
    for (const status of ["ISSUED", "REVOKED", "REISSUED"]) {
      const id = `cert-${status}`;
      store.rows = [certificateRow({ id, status })];
      expect(await issueCertificate({ id, issuedSignatories: SIGNATORIES })).toBeNull();
      expect(row(id).status).toBe(status);
    }
  });

  it("refuses a certificate that does not carry exactly four modules", async () => {
    store.rows = [certificateRow({ id: "cert-3", items: fourModules().slice(0, 3) })];
    await expect(
      issueCertificate({ id: "cert-3", issuedSignatories: SIGNATORIES })
    ).rejects.toThrow(/exactly 4 are required before it can be/);
    expect(row("cert-3").status).toBe("DRAFT");
    expect(row("cert-3").certificateNumber).toBeNull();
  });

  it("replaces the signatory snapshot instead of stacking another copy", async () => {
    store.rows = [
      certificateRow({
        issuedSignatories: [
          {
            id: "old-1",
            certificateId: "cert-1",
            signatoryId: null,
            name: "Outdated Name",
            title: "Old role",
            designation: "Old",
            displayOrder: 0,
          },
        ],
      }),
    ];

    await issueCertificate({ id: "cert-1", issuedSignatories: SIGNATORIES });
    const names = row("cert-1").issuedSignatories.map((sig) => sig.name);
    expect(names).toEqual(["Sita Karki", "Hari Thapa"]);
  });

  it("stores the date the admin picked as UTC midnight, not as the clerk's morning", async () => {
    await issueCertificate({
      id: "cert-1",
      issueDate: "2026-09-01",
      issuedSignatories: SIGNATORIES,
    });
    expect(row("cert-1").issueDate?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("revoking", () => {
  it("keeps the category, the reason and the moment", async () => {
    store.rows = [
      certificateRow({
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00001-K7Q2",
        verificationToken: "toktoktoktoktoktoktoktoktok1234",
      }),
    ];

    const revoked = await revokeCertificate({
      id: "cert-1",
      revokeCategory: "DATA_ERROR",
      revokeReason: "Spelled the recipient name wrong",
    });

    expect(revoked).toEqual({ id: "cert-1", status: "REVOKED" });
    const saved = row("cert-1");
    expect(saved.status).toBe("REVOKED");
    expect(saved.revokeCategory).toBe("DATA_ERROR");
    expect(saved.revokeReason).toBe("Spelled the recipient name wrong");
    expect(saved.revokedAt).toBeInstanceOf(Date);
    // Revocation withdraws the document; it does not rewrite its identity.
    expect(saved.certificateNumber).toBe("DT-CERT-2026-00001-K7Q2");
  });

  it("cannot revoke a draft, and a second revoke changes nothing", async () => {
    store.rows = [certificateRow({ status: "ISSUED" })];
    expect(await revokeCertificate({ id: "cert-1", revokeCategory: "FRAUD", revokeReason: "x" })).toEqual({
      id: "cert-1",
      status: "REVOKED",
    });
    const first = row("cert-1").revokedAt;

    expect(await revokeCertificate({ id: "cert-1", revokeCategory: "FRAUD", revokeReason: "x" })).toBeNull();
    expect(row("cert-1").revokedAt).toBe(first);

    store.rows = [certificateRow({ status: "DRAFT" })];
    expect(await revokeCertificate({ id: "cert-1", revokeCategory: "FRAUD", revokeReason: "x" })).toBeNull();
    expect(row("cert-1").status).toBe("DRAFT");
  });

  it("still revokes the superseded original after a reissue", async () => {
    store.rows = [certificateRow({ status: "REISSUED" })];
    expect(
      await revokeCertificate({ id: "cert-1", revokeCategory: "DUPLICATE", revokeReason: "printed twice" })
    ).toEqual({ id: "cert-1", status: "REVOKED" });
  });
});

describe("reissuing", () => {
  it("moves the old row to REISSUED and creates one fresh issued row", async () => {
    store.rows = [
      certificateRow({
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00001-K7Q2",
        verificationToken: "toktoktoktoktoktoktoktoktok1234",
      }),
    ];

    const reissued = await reissueCertificate({
      id: "cert-1",
      reissueReason: "New spelling of the name",
      issuedSignatories: SIGNATORIES,
    });

    expect(reissued).not.toBeNull();
    const original = row("cert-1");
    expect(original.status).toBe("REISSUED");
    expect(original.reissueReason).toBe("New spelling of the name");
    expect(original.reissuedAt).toBeInstanceOf(Date);

    const replacement = row(reissued!.id);
    expect(replacement.status).toBe("ISSUED");
    // The live document is always exactly one of the pair.
    expect(replacement.parentCertificateId).toBe("cert-1");
    expect(replacement.certificateNumber).not.toBe(original.certificateNumber);
    expect(replacement.verificationToken).not.toBe(original.verificationToken);
    expect(replacement.recipientName).toBe(original.recipientName);
    expect(replacement.courseName).toBe(original.courseName);
    expect(replacement.studentId).toBe("stu-1");
    expect(replacement.items).toHaveLength(4);
    expect(replacement.issuedSignatories.map((sig) => sig.name)).toEqual([
      "Sita Karki",
      "Hari Thapa",
    ]);
  });

  it("refuses a row that is no longer a live document, creating nothing", async () => {
    // A superseded original already reads REISSUED; re-issuing it would print a
    // second live certificate for the same graduate.
    store.rows = [certificateRow({ status: "REVOKED" })];
    expect(
      await reissueCertificate({ id: "cert-1", reissueReason: "x", issuedSignatories: SIGNATORIES })
    ).toBeNull();
    expect(store.created).toHaveLength(0);

    store.rows = [certificateRow({ id: "cert-2", status: "REISSUED" })];
    expect(
      await reissueCertificate({ id: "cert-2", reissueReason: "x", issuedSignatories: SIGNATORIES })
    ).toBeNull();
    expect(store.created).toHaveLength(0);

    store.rows = [certificateRow({ id: "cert-3", status: "DRAFT" })];
    expect(
      await reissueCertificate({ id: "cert-3", reissueReason: "x", issuedSignatories: SIGNATORIES })
    ).toBeNull();
    expect(store.created).toHaveLength(0);
  });

  it("won't clone a snapshot that lost a module", async () => {
    store.rows = [
      certificateRow({
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00001-K7Q2",
        items: fourModules().slice(0, 2),
      }),
    ];

    await expect(
      reissueCertificate({ id: "cert-1", reissueReason: "x", issuedSignatories: SIGNATORIES })
    ).rejects.toThrow(/exactly 4 are required before it can be/);

    // Nothing half-done: the original is still the live certificate.
    expect(row("cert-1").status).toBe("ISSUED");
    expect(store.created).toHaveLength(0);
  });

  it("gives two reissues of the same row exactly one replacement", async () => {
    store.rows = [
      certificateRow({
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00001-K7Q2",
      }),
    ];

    const results = await Promise.all(
      [1, 2].map(() =>
        reissueCertificate({ id: "cert-1", reissueReason: "x", issuedSignatories: SIGNATORIES })
      )
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(store.created).toHaveLength(1);
  });
});

describe("a student reaching their own certificate PDF", () => {
  const get = (id: string) =>
    downloadForStudent(
      new Request(`https://darbar.example/api/student/certificates/${id}/download`) as never,
      { params: Promise.resolve({ id }) }
    );

  beforeEach(() => {
    session.profileId = "stu-1";
    served.length = 0;
    store.rows = [
      certificateRow({
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00001-K7Q2",
        pdfUrl: "certificates/cert-1.pdf",
      }),
      certificateRow({
        id: "cert-2",
        studentId: "stu-2",
        status: "ISSUED",
        certificateNumber: "DT-CERT-2026-00002-M3P7",
        pdfUrl: "certificates/cert-2.pdf",
      }),
    ];
  });

  it("serves the file of a certificate that belongs to the signed-in student", async () => {
    const response = await get("cert-1");
    expect(response.status).toBe(200);
    expect(served).toEqual([{ id: "cert-1", certificateNumber: "DT-CERT-2026-00001-K7Q2" }]);
  });

  it("answers another graduate's id exactly like a row that does not exist", async () => {
    const someoneElses = await get("cert-2");
    const missing = await get("cert-999");

    expect(someoneElses.status).toBe(404);
    expect(await someoneElses.json()).toEqual(await missing.json());
    expect(served).toHaveLength(0);
  });

  it("refuses a document that is not live, without saying what it is", async () => {
    store.rows = [
      certificateRow({
        id: "cert-draft",
        status: "DRAFT",
      }),
      certificateRow({
        id: "cert-revoked",
        status: "REVOKED",
        certificateNumber: "DT-CERT-2026-00009-ZZZZ",
      }),
    ];

    // No number yet means it was never issued; the row is still not downloadable.
    expect((await get("cert-draft")).status).toBe(404);

    const revoked = await get("cert-revoked");
    expect(revoked.status).toBe(409);
    expect(await revoked.json()).toEqual({
      error: "Certificate cannot be downloaded in its current state",
    });
    expect(served).toHaveLength(0);
  });

  it("finds the row only through the signed-in student", async () => {
    expect(await getStudentCertificateDownloadMeta({ id: "stu-1" }, "cert-1")).toEqual({
      certificateNumber: "DT-CERT-2026-00001-K7Q2",
      pdfUrl: "certificates/cert-1.pdf",
      status: "ISSUED",
    });
    expect(await getStudentCertificateDownloadMeta({ id: "stu-2" }, "cert-1")).toBeNull();
    expect(await getStudentCertificateDownloadMeta({ id: "stu-1" }, "cert-999")).toBeNull();
  });
});
