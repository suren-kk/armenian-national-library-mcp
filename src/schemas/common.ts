import { z } from "zod";

export const uuidSchema = z.uuid();
export const pageSchema = z.number().int().min(0).default(0);
export const pageSizeSchema = z.number().int().min(1).default(10);
export const sortSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[A-Za-z0-9_.-]+,(?:ASC|DESC)$/i,
    "sort must use field,ASC or field,DESC",
  )
  .describe(
    "Sort as field,ASC or field,DESC; common examples are score,DESC, dc.date.issued,DESC, and dc.title,ASC",
  );
export const facetNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/, "facet contains unsupported characters")
  .describe(
    "Facet name returned by get_search_facets; common names include author, subject, dateIssued, language, and type",
  );

export const filterSchema = z.object({
  field: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_.-]+$/, "filter field contains unsupported characters")
    .describe(
      "Facet field returned by get_search_facets, such as author, subject, dateIssued, language, or type",
    ),
  value: z
    .string()
    .min(1)
    .max(1_000)
    .describe("Facet value exactly as returned by get_search_facets"),
  operator: z
    .enum(["equals", "contains", "notequals", "authority"])
    .default("equals")
    .describe(
      "equals for an exact value, contains for text matching, notequals to exclude, or authority for a DSpace authority key",
    ),
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
