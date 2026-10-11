import "server-only";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import {
  TEMPLATE_PAGE_SIZE,
  type TemplateFilters,
} from "@/lib/validators/certificates";
import type { TemplateWriteInput } from "@/server/types/certificates";

function templateWhere(filters: TemplateFilters): Prisma.CertificateTemplateWhereInput {
  const conditions: Prisma.CertificateTemplateWhereInput[] = [];

  if (filters.isActive !== undefined) conditions.push({ isActive: filters.isActive });
  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { version: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

export type TemplateListRow = {
  id: string;
  name: string;
  version: string;
  isActive: boolean;
  layoutConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateListResult = {
  rows: TemplateListRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function adminListTemplates(
  filters: TemplateFilters
): Promise<TemplateListResult> {
  const where = templateWhere(filters);
  const total = await db.certificateTemplate.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / TEMPLATE_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await db.certificateTemplate.findMany({
    where,
    orderBy: [{ name: "asc" }, { version: "asc" }],
    skip: (page - 1) * TEMPLATE_PAGE_SIZE,
    take: TEMPLATE_PAGE_SIZE,
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      isActive: row.isActive,
      layoutConfig: (row.layoutConfig as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    pageCount,
  };
}

export async function adminGetTemplate(id: string): Promise<TemplateListRow | null> {
  const row = await db.certificateTemplate.findUnique({ where: { id } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    isActive: row.isActive,
    layoutConfig: (row.layoutConfig as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listActiveTemplates(): Promise<
  Array<{
    id: string;
    name: string;
    version: string;
    layoutConfig: Record<string, unknown> | null;
  }>
> {
  const rows = await db.certificateTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { version: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    version: row.version,
    layoutConfig: (row.layoutConfig as Record<string, unknown> | null) ?? null,
  }));
}

export async function templateNameVersionExists(
  name: string,
  version: string,
  exceptId?: string
): Promise<boolean> {
  const existing = await db.certificateTemplate.findFirst({
    where: { name, version },
    select: { id: true },
  });
  return !!existing && existing.id !== exceptId;
}

export async function getTemplateWriteSnapshot(id: string) {
  return db.certificateTemplate.findUnique({
    where: { id },
    select: { id: true, name: true, version: true, isActive: true },
  });
}

export async function createTemplate(
  values: TemplateWriteInput
): Promise<{ id: string }> {
  return db.certificateTemplate.create({
    data: {
      name: values.name,
      version: values.version,
      layoutConfig: (values.layoutConfig ??
        Prisma.DbNull) as Prisma.InputJsonValue,
      isActive: values.isActive ?? true,
    },
    select: { id: true },
  });
}

export async function updateTemplate(
  id: string,
  values: TemplateWriteInput
): Promise<{ id: string }> {
  return db.certificateTemplate.update({
    where: { id },
    data: {
      name: values.name,
      version: values.version,
      layoutConfig: (values.layoutConfig ??
        Prisma.DbNull) as Prisma.InputJsonValue,
      isActive: values.isActive ?? true,
    },
    select: { id: true },
  });
}

export async function deleteTemplate(id: string): Promise<{ id: string }> {
  return db.certificateTemplate.delete({
    where: { id },
    select: { id: true },
  });
}
