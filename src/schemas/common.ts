import { z } from "zod";

export const uuidSchema = z.uuid();
export const pageSchema = z.number().int().min(0).default(0);
export const pageSizeSchema = z.number().int().min(1).default(10);

export const filterSchema = z.object({
  field: z.string().min(1).max(100),
  value: z.string().min(1).max(1_000),
  operator: z
    .enum(["equals", "contains", "notequals", "authority"])
    .default("equals"),
});

export const paginationSchema = z
  .object({
    page: z.number().int().nonnegative(),
    pageSize: z.number().int().nonnegative(),
    totalElements: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
    hasNext: z.boolean(),
  })
  .nullable();

export const sourceSchema = z.object({
  repository: z.literal("National Library of Armenia"),
  url: z.url(),
  retrievedAt: z.iso.datetime(),
  etag: z.string().optional(),
  lastModified: z.string().optional(),
});

export const envelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    pagination: paginationSchema,
    source: sourceSchema,
    warnings: z.array(z.string()),
    truncated: z.boolean(),
  });
