import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient, Role, type LeadSource, type LeadStatus } from "../src/generated/prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { symmetricEncrypt } from "better-auth/crypto";
import { TWO_FACTOR_REQUIRED_ROLES } from "../src/lib/validators/users";
import { E2E_TOTP_SECRET } from "../e2e/totp";
import { assertE2eSeedAllowed } from "./seed-guard";

/**
 * End-to-end fixtures (docs/08 §2, "Test data").
 *
 * One user per role plus a handful of leads spread across statuses, sources and
 * days, so the Playwright suite and the DAL integration tests have something
 * deterministic to assert against.
 *
 * NEVER run this against production. It writes rows that look like real staff and
 * real enquiries, and every account shares one published password. `./seed-guard.ts`
 * therefore requires BOTH `NODE_ENV !== "production"` and an explicit opt-in:
 *
 *   npm run db:seed:test                                  # passes --allow-e2e-seed
 *   ALLOW_E2E_SEED=1 npx tsx prisma/seed-test.ts          # same opt-in as an env var
 *
 * Passwords default to the values in `e2e/helpers.ts`; override with
 * E2E_*_PASSWORD environment variables, or with SEED_TEST_PASSWORD for all four.
 *
 * The gated roles (fix guide §4) also get an authenticator, because a fixture
 * without one cannot reach any data screen: `requireUser()` parks it on
 * `/techdarbar/account`. That enrollment is written directly, not through the
 * account screen, so `AUTH_SECRET` must be set — it encrypts the stored secret
 * exactly as Better Auth would, and the server decrypts it with the same key at
 * sign-in. The secret itself is shared by every fixture and read from
 * `E2E_TOTP_SECRET`; `e2e/totp.ts` turns it into the six-digit code.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Sign-up is disabled in the application config (src/server/auth.ts); this
// script is one of the two places allowed to create users that way. The other is
// prisma/seed.ts. Do not import the application auth instance here.
const seedAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  secret: process.env.AUTH_SECRET,
});

const MIN_PASSWORD_LENGTH = 10;
const TEST_PASSWORD = process.env.SEED_TEST_PASSWORD || "E2eSuperAdmin!2026";

type Fixture = {
  key: string;
  email: string;
  name: string;
  role: Role;
  password: string;
};

const STAFF: Fixture[] = [
  {
    key: "super-admin",
    email: process.env.E2E_SUPER_ADMIN_EMAIL || "e2e-super-admin@darbar.test",
    name: "E2E Super Admin",
    role: "SUPER_ADMIN",
    password: process.env.E2E_SUPER_ADMIN_PASSWORD || TEST_PASSWORD,
  },
  {
    key: "admin",
    email: process.env.E2E_ADMIN_EMAIL || "e2e-admin@darbar.test",
    name: "E2E Admin",
    role: "ADMIN",
    password: process.env.E2E_ADMIN_PASSWORD || TEST_PASSWORD,
  },
  {
    key: "editor",
    email: process.env.E2E_EDITOR_EMAIL || "e2e-editor@darbar.test",
    name: "E2E Editor",
    role: "EDITOR",
    password: process.env.E2E_EDITOR_PASSWORD || TEST_PASSWORD,
  },
  {
    key: "counselor",
    email: process.env.E2E_COUNSELOR_EMAIL || "e2e-counselor@darbar.test",
    name: "E2E Counselor",
    role: "COUNSELOR",
    password: process.env.E2E_COUNSELOR_PASSWORD || TEST_PASSWORD,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed anchor keeps re-runs from shifting the dashboard's 7/30-day buckets. */
const NOW = Date.now();

async function seedStaff(): Promise<Map<string, string>> {
  const idByKey = new Map<string, string>();

  for (const staff of STAFF) {
    if (staff.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(
        `${staff.key}: password must be at least ${MIN_PASSWORD_LENGTH} characters`
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email: staff.email },
      select: { id: true },
    });

    if (existing) {
      // Idempotent: reuse the row, force the role and reactivation. Passwords
      // are left alone — `signUpEmail` is the only way to set them.
      const updated = await prisma.user.update({
        where: { email: staff.email },
        data: { role: staff.role, isActive: true, name: staff.name },
        select: { id: true },
      });
      idByKey.set(staff.key, updated.id);
      console.log(`  ${staff.role.padEnd(12)} ${staff.email} — exists`);
      continue;
    }

    await seedAuth.api.signUpEmail({
      body: { email: staff.email, password: staff.password, name: staff.name },
    });
    const created = await prisma.user.update({
      where: { email: staff.email },
      data: { role: staff.role, isActive: true },
      select: { id: true },
    });
    idByKey.set(staff.key, created.id);
    console.log(`  ${staff.role.padEnd(12)} ${staff.email} — created`);
  }

  return idByKey;
}

async function seedTwoFactor(idByKey: Map<string, string>) {
  const gated = STAFF.filter((staff) => TWO_FACTOR_REQUIRED_ROLES.includes(staff.role));
  if (gated.length === 0) return;

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    throw new Error(
      "AUTH_SECRET is not set, but the fixtures above need an authenticator. Better Auth " +
        "stores TwoFactor.secret encrypted with this key, so a row written without it can " +
        "never be decrypted at sign-in."
    );
  }

  // The same shape the two-factor plugin writes when a person scans the QR in the
  // account screen: the secret as a bare string, the backup codes as a JSON array,
  // both encrypted, `verified` true so sign-in accepts a code instead of treating
  // the enrollment as half-finished.
  const secret = await symmetricEncrypt({ key: authSecret, data: E2E_TOTP_SECRET });
  const backupCodes = await symmetricEncrypt({
    key: authSecret,
    data: JSON.stringify(["e2ebk-11111", "e2ebk-22222"]),
  });

  for (const staff of gated) {
    const userId = idByKey.get(staff.key);
    if (!userId) continue;

    await prisma.twoFactor.upsert({
      where: { userId },
      create: { userId, secret, backupCodes, verified: true },
      update: {
        secret,
        backupCodes,
        verified: true,
        // A previous run may have mistyped enough codes to trip the account lock
        // (five failures, fifteen minutes); fixtures start every run clean.
        failedVerificationCount: 0,
        lockedUntil: null,
      },
    });
    await prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: true } });
    console.log(`  ${staff.role.padEnd(12)} ${staff.email} — two-factor enrolled`);
  }
}

async function seedLeads(idByKey: Map<string, string>) {
  const counselorId = idByKey.get("counselor") ?? null;

  const leads: {
    fullName: string;
    phone: string;
    email: string;
    status: LeadStatus;
    source: LeadSource;
    daysAgo: number;
    assignedToId: string | null;
    lostReason?: string;
  }[] = [
    {
      fullName: "Ram Sharma",
      phone: "9800000001",
      email: "ram.sharma@darbar.test",
      status: "NEW",
      source: "WEBSITE_INQUIRY",
      daysAgo: 0,
      assignedToId: null,
    },
    {
      fullName: "Sita Gurung",
      phone: "9800000002",
      email: "sita.gurung@darbar.test",
      status: "CONTACTED",
      source: "PHONE",
      daysAgo: 1,
      assignedToId: counselorId,
    },
    {
      fullName: "Bishal Thapa",
      phone: "9800000003",
      email: "bishal.thapa@darbar.test",
      status: "COUNSELING_DONE",
      source: "REFERRAL",
      daysAgo: 3,
      assignedToId: counselorId,
    },
    {
      fullName: "Anisha Rai",
      phone: "9800000004",
      email: "anisha.rai@darbar.test",
      status: "ENROLLED",
      source: "WHATSAPP",
      daysAgo: 6,
      assignedToId: counselorId,
    },
    {
      fullName: "Nabin Karki",
      phone: "9800000005",
      email: "nabin.karki@darbar.test",
      status: "LOST",
      source: "WALK_IN",
      daysAgo: 9,
      assignedToId: null,
      lostReason: "Chose a cheaper institute",
    },
    {
      fullName: "Pratiksha Adhikari",
      phone: "9800000006",
      email: "pratiksha.adhikari@darbar.test",
      status: "SPAM",
      source: "OTHER",
      daysAgo: 12,
      assignedToId: null,
    },
  ];

  for (const lead of leads) {
    // `phone` is indexed but not unique, so this is findFirst + update/create
    // rather than upsert. A re-run updates the fixture instead of duplicating
    // it, which keeps the dashboard counts stable across runs.
    const existing = await prisma.lead.findFirst({
      where: { phone: lead.phone },
      select: { id: true },
    });

    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          fullName: lead.fullName,
          email: lead.email,
          status: lead.status,
          source: lead.source,
          assignedToId: lead.assignedToId,
          lostReason: lead.lostReason ?? null,
        },
      });
      continue;
    }

    await prisma.lead.create({
      data: {
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        status: lead.status,
        source: lead.source,
        assignedToId: lead.assignedToId,
        lostReason: lead.lostReason ?? null,
        enrolledAt: lead.status === "ENROLLED" ? new Date(NOW) : null,
        consentAt: new Date(NOW),
        createdAt: new Date(NOW - lead.daysAgo * DAY_MS),
      },
    });
  }

  console.log(`  ${leads.length} leads`);
}

async function main() {
  // Both keys: not production, and an explicit "this database is disposable".
  assertE2eSeedAllowed();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Seeding e2e fixtures…");
  const idByKey = await seedStaff();
  await seedTwoFactor(idByKey);
  await seedLeads(idByKey);
  console.log("Done. Sign in with any of the addresses printed above.");
}

main()
  .catch((error: unknown) => {
    console.error(
      "[seed-test]",
      error instanceof Error ? error.message : "unknown"
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
