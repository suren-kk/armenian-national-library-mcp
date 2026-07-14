import { z } from "zod";
import {
  checksumSchema,
  metadataMapSchema,
  metadataValueSchema,
} from "./upstream-schemas.js";

export const bundleClassificationSchema = z.enum([
  "ORIGINAL",
  "TEXT",
  "THUMBNAIL",
  "LICENSE",
  "OTHER",
]);

export const normalizedRightsSchema = z.object({
  status: z.enum(["declared", "unknown"]),
  statements: z.array(metadataValueSchema),
  uris: z.array(metadataValueSchema),
  holders: z.array(metadataValueSchema),
  accessRights: z.array(metadataValueSchema),
  licences: z.array(metadataValueSchema),
  reusable: z.null(),
});

export const normalizedMetadataSchema = z.object({
  uuid: z.uuid(),
  handle: z.string().nullable(),
  title: z.array(metadataValueSchema),
  authors: z.array(metadataValueSchema),
  contributors: z.array(metadataValueSchema),
  subjects: z.array(metadataValueSchema),
  descriptions: z.array(metadataValueSchema),
  abstracts: z.array(metadataValueSchema),
  languages: z.array(metadataValueSchema),
  dateIssued: z.array(metadataValueSchema),
  publisher: z.array(metadataValueSchema),
  publicationPlace: z.array(metadataValueSchema),
  documentType: z.array(metadataValueSchema),
  pages: z.array(metadataValueSchema),
  identifiers: z.array(metadataValueSchema),
  rights: normalizedRightsSchema,
  canonicalUrl: z.url(),
  lastModified: z.string().nullable(),
  inArchive: z.boolean().nullable(),
  discoverable: z.boolean().nullable(),
  withdrawn: z.boolean().nullable(),
});

export const normalizedDspaceObjectSchema = z.object({
  type: z.string(),
  name: z.string().nullable(),
  metadata: metadataMapSchema,
  normalized: normalizedMetadataSchema,
});

export const resourceLinkSchema = z.object({
  type: z.literal("resource_link"),
  uri: z.string().startsWith("nla://bitstream/"),
  name: z.string(),
  description: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative(),
});

export const resolvedBitstreamSchema = z.object({
  uuid: z.uuid(),
  filename: z.string(),
  bundle: bundleClassificationSchema,
  mimeType: z.string(),
  detectedMimeType: z.string().nullable(),
  mimeVerification: z.enum(["declared-unverified", "verified"]),
  inlineEligible: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  format: z.object({
    id: z.number().int(),
    name: z.string(),
    description: z.string(),
    supportLevel: z.string(),
    extensions: z.array(z.string()),
  }),
  access: z.object({
    status: z.string(),
    embargoDate: z.string().nullable(),
    publiclyReadable: z.boolean(),
  }),
  checksum: checksumSchema.nullable(),
  metadata: metadataMapSchema,
  resourceLink: resourceLinkSchema.nullable(),
  metadataResource: z.string().startsWith("nla://bitstream/"),
  downloadUrl: z.url().nullable(),
});

export type BundleClassification = z.infer<typeof bundleClassificationSchema>;
export type NormalizedRights = z.infer<typeof normalizedRightsSchema>;
export type NormalizedMetadata = z.infer<typeof normalizedMetadataSchema>;
export type NormalizedDspaceObject = z.infer<
  typeof normalizedDspaceObjectSchema
>;
export type ResolvedBitstream = z.infer<typeof resolvedBitstreamSchema>;
