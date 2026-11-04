import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import type { Role } from "../../generated/prisma/enums";
import { db } from "../db";

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

export const countActiveSuperAdmins = async () =>
  db.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });

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

export const updateUser = async (id: string, data: Prisma.UserUpdateInput) => {
  return db.user.update({ where: { id }, data, select: { id: true } });
};

export const setUserActive = async (id: string, isActive: boolean) =>
  db.user.update({ where: { id }, data: { isActive }, select: { id: true } });

export const deleteUser = async (id: string) =>
  db.user.delete({ where: { id }, select: { id: true } });

/** A deactivated account or rotated password must drop all live sessions. */
export const revokeUserSessions = async (id: string) => db.session.deleteMany({ where: { userId: id } });

export const upsertCredentialPassword = async (userId: string, passwordHash: string) =>
  db.account.upsert({
    where: { providerId_accountId: { providerId: "credential", accountId: userId } },
    create: { providerId: "credential", accountId: userId, userId, password: passwordHash },
    update: { password: passwordHash },
  });
