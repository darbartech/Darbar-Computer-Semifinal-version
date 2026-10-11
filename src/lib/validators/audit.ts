import { z } from "zod";
import { pageParamSchema } from "./shared";

export const auditLogFilterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(80).optional(),
  action: z.string().trim().max(80).optional(),
  page: pageParamSchema,
});

export type AuditLogFilters = z.output<typeof auditLogFilterSchema>;
