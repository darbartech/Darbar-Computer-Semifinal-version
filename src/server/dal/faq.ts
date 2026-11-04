import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { PUBLIC_LIST_LIMIT } from "../constants";
import { FAQ_TAGS } from "../revalidate";

export const listPublishedFaqs = cached(FAQ_TAGS, async () => {
  return db.faq.findMany({ where: { isPublished: true }, include: { category: true }, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }], take: PUBLIC_LIST_LIMIT });
});
export const adminListFaqCategories = async () => db.faqCategory.findMany({ include: { faqs: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } });
export const getFaq = async (id: string) => db.faq.findUnique({ where: { id } });
export const getFaqCategory = async (id: string) => db.faqCategory.findUnique({ where: { id } });
export const createFaqCategory = async (data: Prisma.FaqCategoryCreateInput) => db.faqCategory.create({ data });
export const updateFaqCategory = async (id: string, data: Prisma.FaqCategoryUpdateInput) => db.faqCategory.update({ where: { id }, data });
export const createFaq = async (data: Prisma.FaqCreateInput) => db.faq.create({ data });
export const updateFaq = async (id: string, data: Prisma.FaqUpdateInput) => db.faq.update({ where: { id }, data });
export const deleteFaq = async (id: string) => db.faq.delete({ where: { id } });

