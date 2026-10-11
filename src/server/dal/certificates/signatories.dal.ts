import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  SIGNATORY_PAGE_SIZE,
  type SignatoryFilters,
} from "@/lib/validators/certificates";
import type { SignatoryWriteInput } from "@/server/types/certificates";

function signatoryWhere(filters: SignatoryFilters): Prisma.CertificateSignatoryWhereInput {
  const conditions: Prisma.CertificateSignatoryWhereInput[] = [];

  if (filters.isActive !== undefined) conditions.push({ isActive: filters.isActive });
  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { title: { contains: filters.q, mode: "insensitive" } },
        { designation: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

export type SignatoryListRow = {
  id: string;
  name: string;
  title: string;
  designation: string;
  signatureUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SignatoryListResult = {
  rows: SignatoryListRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function adminListSignatories(
  filters: SignatoryFilters
): Promise<SignatoryListResult> {
  const where = signatoryWhere(filters);
  const total = await db.certificateSignatory.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SIGNATORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await db.certificateSignatory.findMany({
    where,
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    skip: (page - 1) * SIGNATORY_PAGE_SIZE,
    take: SIGNATORY_PAGE_SIZE,
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      designation: row.designation,
      signatureUrl: row.signatureUrl,
      isActive: row.isActive,
      displayOrder: row.displayOrder,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    pageCount,
  };
}

export async function adminGetSignatory(id: string): Promise<SignatoryListRow | null> {
  const row = await db.certificateSignatory.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    designation: row.designation,
    signatureUrl: row.signatureUrl,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listActiveSignatories(): Promise<
  Array<{
    id: string;
    name: string;
    title: string;
    designation: string;
    signatureUrl: string | null;
    displayOrder: number;
  }>
> {
  return db.certificateSignatory.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      title: true,
      designation: true,
      signatureUrl: true,
      displayOrder: true,
    },
  });
}

export async function getSignatoryWriteSnapshot(id: string) {
  return db.certificateSignatory.findUnique({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });
}

export async function createSignatory(
  values: SignatoryWriteInput
): Promise<{ id: string }> {
  return db.certificateSignatory.create({
    data: {
      name: values.name,
      title: values.title,
      designation: values.designation,
      signatureUrl: values.signatureUrl ?? null,
      isActive: values.isActive ?? true,
      displayOrder: values.displayOrder ?? 0,
    },
    select: { id: true },
  });
}

export async function updateSignatory(
  id: string,
  values: SignatoryWriteInput
): Promise<{ id: string }> {
  return db.certificateSignatory.update({
    where: { id },
    data: {
      name: values.name,
      title: values.title,
      designation: values.designation,
      signatureUrl: values.signatureUrl ?? null,
      isActive: values.isActive ?? true,
      displayOrder: values.displayOrder ?? 0,
    },
    select: { id: true },
  });
}

export async function deleteSignatory(id: string): Promise<{ id: string }> {
  return db.certificateSignatory.delete({
    where: { id },
    select: { id: true },
  });
}
