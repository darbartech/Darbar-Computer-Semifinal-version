import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { Role } from "../../generated/prisma/enums";
import { db } from "../db";
import type { Tx } from "./counters";

export const PAGE_SIZE = 20;

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  emailVerified: true,
  image: true,
  lastLoginAt: true,
  twoFactorEnabled: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type AdminUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export const adminListUsers = async (filters: {
  q?: string;
  role?: Role | string;
  isActive?: string;
  page?: number;
}) => {
  const conditions: Prisma.UserWhereInput[] = [
    // This is the staff directory; student accounts are managed under
    // /techdarbar/students, so they never appear here (docs/04 §4.8).
    { role: { not: "STUDENT" } },
  ];
  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { email: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.role) conditions.push({ role: filters.role as Prisma.EnumRoleFilter });
  if (filters.isActive) conditions.push({ isActive: filters.isActive === "true" });
  const where = { AND: conditions };
  const total = await db.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: userSelect,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { rows, total, page, pageCount };
};

export const adminGetUser = async (id: string) => {
  return db.user.findUnique({ where: { id }, select: userSelect });
};

/** Writes only the profile picture; name/role/status are edited elsewhere. */
export const setUserImage = async (id: string, image: string | null) =>
  db.user.update({ where: { id }, data: { image } });

/** Used to enforce the unique email constraint before Prisma throws. */
export const findUserByEmail = async (email: string, excludeId?: string) =>
  db.user.findFirst({
    where: { email, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });

/**
 * Guarded staff-account writes (fix guide §11).
 *
 * The rule "at least one active SUPER_ADMIN must remain" used to be a count in
 * one statement and the write in the next. Two superadmins demoted from another
 * account at the same moment each read the same count, each decided there was
 * still one left, and both committed — the institute then has no account that
 * can create accounts, which is only discoverable when somebody needs it.
 *
 * `SELECT … FOR UPDATE` locks the active super-admin rows for the length of the
 * transaction, so the second writer blocks on the first one's commit. Postgres
 * re-checks the predicate against the newest committed row version, so the count
 * it then reads is the truth rather than a snapshot of a state that no longer
 * exists.
 */
export type GuardedWrite = { ok: true } | { ok: false; reason: "last-super-admin" };

export const LAST_SUPER_ADMIN_MESSAGE =
  "At least one active super administrator must remain";

const occupiesSuperAdminSeat = (user: { role: Role; isActive: boolean }) =>
  user.role === "SUPER_ADMIN" && user.isActive;

const lockActiveSuperAdmins = async (tx: Tx) =>
  tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'SUPER_ADMIN' AND "isActive" = true
    FOR UPDATE`;

/**
 * Does this write take a seat away from the active super-admin group? `next` is
 * what the row becomes, or `null` when the row stops existing.
 */
const losesActiveSuperAdmin = (
  target: { role: Role; isActive: boolean },
  next: { role: Role; isActive: boolean } | null
) => occupiesSuperAdminSeat(target) && (next === null || !occupiesSuperAdminSeat(next));

export const updateUserGuarded = async (
  id: string,
  data: { name: string; email: string; role: Role; isActive: boolean }
): Promise<GuardedWrite> =>
  db.$transaction(async (tx): Promise<GuardedWrite> => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { role: true, isActive: true, email: true },
    });
    if (!target) return { ok: true };
    if (
      losesActiveSuperAdmin(target, { role: data.role, isActive: data.isActive }) &&
      (await lockActiveSuperAdmins(tx)).length <= 1
    ) {
      return { ok: false, reason: "last-super-admin" };
    }
    await tx.user.update({ where: { id }, data });
    // A changed address is a different person at the same cookie: every live
    // session goes with it, in the same transaction as the rename (fix guide §11).
    // Deactivating the account drops its sessions on the very next request.
    if (data.email !== target.email || !data.isActive) {
      await tx.session.deleteMany({ where: { userId: id } });
    }
    return { ok: true };
  });

/**
 * Activate or deactivate an account behind the last-super-admin floor.
 *
 * The action used to re-read `existing` outside the transaction; here the row is
 * read under the same lock the decision needs, so a role changed a moment ago
 * cannot be judged from stale data.
 */
export const setUserActiveGuarded = async (
  id: string,
  isActive: boolean
): Promise<GuardedWrite> =>
  db.$transaction(async (tx): Promise<GuardedWrite> => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { role: true, isActive: true },
    });
    if (!target) return { ok: true };
    if (
      losesActiveSuperAdmin(target, { role: target.role, isActive }) &&
      (await lockActiveSuperAdmins(tx)).length <= 1
    ) {
      return { ok: false, reason: "last-super-admin" };
    }
    await tx.user.update({ where: { id }, data: { isActive } });
    // Deactivation must take effect on the very next request (docs/08 §1).
    if (!isActive) await tx.session.deleteMany({ where: { userId: id } });
    return { ok: true };
  });

/** Delete an account, refusing to delete the last active super administrator. */
export const deleteUserGuarded = async (id: string): Promise<GuardedWrite> =>
  db.$transaction(async (tx): Promise<GuardedWrite> => {
    const target = await tx.user.findUnique({
      where: { id },
      select: { role: true, isActive: true },
    });
    if (!target) return { ok: true };
    if (
      losesActiveSuperAdmin(target, null) &&
      (await lockActiveSuperAdmins(tx)).length <= 1
    ) {
      return { ok: false, reason: "last-super-admin" };
    }
    await tx.user.delete({ where: { id } });
    return { ok: true };
  });

/**
 * Creates the User row and its better-auth `credential` Account in one
 * transaction. The account's `accountId` equals the user id, matching how
 * better-auth's email/password provider looks the credential up at sign-in.
 */
export const createUserWithCredential = async (data: {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
}) =>
  db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        isActive: data.isActive,
        // An admin creating the account is equivalent to verification.
        emailVerified: true,
      },
    });
    await tx.account.create({
      data: {
        providerId: "credential",
        accountId: user.id,
        userId: user.id,
        password: data.passwordHash,
      },
    });
    return user;
  });

/** A deactivated account or rotated password must drop all live sessions. */
export const revokeUserSessions = async (id: string) => db.session.deleteMany({ where: { userId: id } });

/**
 * Recovery for a lost authenticator (fix guide §4). The enrolled secret and its
 * backup codes go with it, the flag comes off, and every live session of that
 * account is dropped — a reset must not leave a cookie that still passes the
 * gate a second factor was supposed to hold.
 */
export const resetUserTwoFactor = async (id: string) =>
  db.$transaction(async (tx) => {
    const cleared = await tx.twoFactor.deleteMany({ where: { userId: id } });
    await tx.user.update({ where: { id }, data: { twoFactorEnabled: false } });
    const sessions = await tx.session.deleteMany({ where: { userId: id } });
    return { secretsCleared: cleared.count, sessionsRevoked: sessions.count };
  });
