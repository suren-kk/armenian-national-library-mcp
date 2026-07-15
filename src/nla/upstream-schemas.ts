import { z } from "zod";
import { NlaError } from "./errors.js";

export const metadataValueSchema = z
  .object({
    value: z.string(),
    language: z.string().nullable(),
    authority: z.string().nullable(),
    confidence: z.number().int(),
    place: z.number().int().nonnegative(),
  })
  .passthrough();

export const metadataMapSchema = z.record(
  z.string(),
  z.array(metadataValueSchema),
);

export const dspaceObjectSchema = z
  .object({
    id: z.string().optional(),
    uuid: z.string().optional(),
    name: z.string().optional(),
    handle: z.string().nullable().optional(),
    metadata: metadataMapSchema.optional(),
    type: z.string().min(1),
    inArchive: z.boolean().optional(),
    discoverable: z.boolean().optional(),
    withdrawn: z.boolean().optional(),
    lastModified: z.string().optional(),
  })
  .passthrough()
  .refine((value) => value.id !== undefined || value.uuid !== undefined, {
    message: "DSpace object omitted its identifier",
  });

export const checksumSchema = z
  .object({
    checkSumAlgorithm: z.string().min(1),
    value: z.string().min(1),
  })
  .passthrough();

export const bitstreamSchema = dspaceObjectSchema.and(
  z
    .object({
      type: z.literal("bitstream"),
      uuid: z.string(),
      name: z.string(),
      bundleName: z.string().optional(),
      sizeBytes: z.number().int().nonnegative().safe(),
      sequenceId: z.number().int().optional(),
      checkSum: checksumSchema.optional(),
    })
    .passthrough(),
);

export const bitstreamFormatSchema = z
  .object({
    id: z.number().int(),
    shortDescription: z.string(),
    description: z.string(),
    mimetype: z.string().min(1),
    supportLevel: z.string(),
    internal: z.boolean(),
    extensions: z.array(z.string()),
    type: z.literal("bitstreamformat"),
  })
  .passthrough();

export const accessStatusSchema = z
  .object({
    status: z.string().min(1),
    embargoDate: z.string().nullable(),
    type: z.literal("accessStatus"),
  })
  .passthrough();

export const searchObjectSchema = z
  .object({
    hitHighlights: z
      .record(z.string(), z.array(z.string()))
      .nullable()
      .optional(),
    _embedded: z.object({ indexableObject: dspaceObjectSchema }),
  })
  .passthrough();

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw NlaError.invalidResponse(`Malformed DSpace ${label}`, {
      fields: result.error.issues
        .slice(0, 5)
        .map((issue) => issue.path.join(".")),
    });
  }
  return result.data;
}

export type MetadataValue = z.infer<typeof metadataValueSchema>;
export type MetadataMap = z.infer<typeof metadataMapSchema>;
export type DspaceObject = z.infer<typeof dspaceObjectSchema>;
export type Bitstream = z.infer<typeof bitstreamSchema>;
export type BitstreamFormat = z.infer<typeof bitstreamFormatSchema>;
export type AccessStatus = z.infer<typeof accessStatusSchema>;
export type SearchObject = z.infer<typeof searchObjectSchema>;

export function parseDspaceObject(value: unknown): DspaceObject {
  return parse(dspaceObjectSchema, value, "object");
}

export function parseBitstream(value: unknown): Bitstream {
  return parse(bitstreamSchema, value, "bitstream");
}

export function parseBitstreamFormat(value: unknown): BitstreamFormat {
  return parse(bitstreamFormatSchema, value, "bitstream format");
}

export function parseAccessStatus(value: unknown): AccessStatus {
  return parse(accessStatusSchema, value, "access status");
}

export function parseSearchObject(value: unknown): SearchObject {
  return parse(searchObjectSchema, value, "search object");
}
