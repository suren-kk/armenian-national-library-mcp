import { z } from "zod";
import {
  bundleClassificationSchema,
  normalizedDspaceObjectSchema,
  resolvedBitstreamSchema,
  resourceLinkSchema,
} from "../nla/domain-schemas.js";
import { endpointRecordSchema } from "../nla/endpoint-registry.js";
import {
  metadataMapSchema,
  metadataValueSchema,
} from "../nla/upstream-schemas.js";
import { envelopeSchema } from "./common.js";

export { metadataMapSchema, metadataValueSchema };

const normalizedDspaceSummarySchema = normalizedDspaceObjectSchema.omit({
  metadata: true,
});

const searchResultEntrySchema = z.union([
  normalizedDspaceObjectSchema.extend({
    highlights: z.record(z.string(), z.array(z.string())),
  }),
  normalizedDspaceSummarySchema.extend({
    highlights: z.record(z.string(), z.array(z.string())),
  }),
]);

const jsonRecordSchema = z.record(z.string(), z.unknown());

const searchDataSchema = z.object({
  results: z.array(searchResultEntrySchema),
  facets: z.array(jsonRecordSchema),
  appliedFilters: z.unknown().nullable(),
  query: z.string(),
});

const browseDataSchema = z.object({
  mode: z.enum(["items", "entries"]),
  values: z.array(z.union([normalizedDspaceObjectSchema, jsonRecordSchema])),
});

const bundleWithFilesSchema = z.object({
  uuid: z.uuid(),
  name: z.string(),
  classification: bundleClassificationSchema,
  files: z.array(resolvedBitstreamSchema),
  filesTruncated: z.boolean(),
  filesPagination: z
    .object({
      page: z.number().int().nonnegative(),
      pageSize: z.number().int().nonnegative(),
      totalElements: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
    })
    .nullable(),
});

const itemFilesDataSchema = z.object({
  item: normalizedDspaceObjectSchema,
  bundles: z.array(bundleWithFilesSchema),
});

const itemTextDataSchema = z.object({
  itemUuid: z.uuid(),
  bitstreamUuid: z.uuid(),
  filename: z.string(),
  mimeType: z.literal("text/plain"),
  text: z.string(),
  offsetChars: z.number().int().nonnegative(),
  returnedChars: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  provenance: z.object({
    kind: z.literal("nla-provided-extracted-text"),
    label: z.literal("NLA-provided extracted text"),
    bundle: z.literal("TEXT"),
    derivedLocally: z.literal(false),
    untrustedSourceData: z.literal(true),
  }),
  resourceLink: resourceLinkSchema,
  downloadUrl: z.url(),
});

const endpointSummarySchema = z.object({
  totalRelations: z.number().int().nonnegative(),
  rawReadableRelations: z.number().int().nonnegative(),
  semanticRelations: z.number().int().nonnegative(),
  byAccess: z.record(z.string(), z.number().int().nonnegative()),
  byRisk: z.record(z.string(), z.number().int().nonnegative()),
  byFamily: z.record(z.string(), z.number().int().nonnegative()),
  semanticTools: z.array(z.string()),
});

const apiCapabilitiesDataSchema = z.object({
  profile: z.literal("public-read"),
  allowedMethods: z.tuple([z.literal("GET"), z.literal("HEAD")]),
  mutationAllowed: z.literal(false),
  arbitraryUrlsAllowed: z.literal(false),
  bitstreamContentViaRawApi: z.literal(false),
  summary: endpointSummarySchema,
  rawAllowedPaths: z.array(z.string().startsWith("/")),
  endpoints: z.array(endpointRecordSchema).optional(),
});

const rawApiDataSchema = z.object({
  method: z.enum(["GET", "HEAD"]),
  path: z.string(),
  status: z.number().int(),
  contentType: z.string(),
  body: z.unknown().nullable(),
});

const jsonEnvelope = envelopeSchema(jsonRecordSchema);
const objectListEnvelope = envelopeSchema(
  z.array(normalizedDspaceObjectSchema),
);

export const toolEnvelopeOutputs = {
  search_catalog: envelopeSchema(searchDataSchema),
  get_search_facets: envelopeSchema(
    z.union([z.array(jsonRecordSchema), jsonRecordSchema]),
  ),
  browse_catalog: envelopeSchema(browseDataSchema),
  list_communities: objectListEnvelope,
  get_community: envelopeSchema(normalizedDspaceObjectSchema),
  list_subcommunities: objectListEnvelope,
  list_community_collections: objectListEnvelope,
  list_collections: objectListEnvelope,
  get_collection: envelopeSchema(normalizedDspaceObjectSchema),
  list_collection_items: envelopeSchema(searchDataSchema),
  get_item: envelopeSchema(normalizedDspaceObjectSchema),
  get_item_access_status: jsonEnvelope,
  list_item_files: envelopeSchema(itemFilesDataSchema),
  get_item_text: envelopeSchema(itemTextDataSchema),
  get_bitstream: envelopeSchema(resolvedBitstreamSchema),
  get_file_download: envelopeSchema(resolvedBitstreamSchema),
  get_item_relationships: jsonEnvelope,
  get_item_version: jsonEnvelope,
  get_item_identifiers: jsonEnvelope,
  resolve_identifier: envelopeSchema(normalizedDspaceObjectSchema),
  get_api_capabilities: envelopeSchema(apiCapabilitiesDataSchema),
  nla_api_get: envelopeSchema(rawApiDataSchema),
} satisfies Record<string, z.ZodObject>;

export type EnvelopeToolName = keyof typeof toolEnvelopeOutputs;

export const healthOutput = z.object({
  status: z.literal("ok"),
  repository: z.literal("National Library of Armenia"),
  projectStatus: z.literal("independent-unofficial-research"),
  maintainer: z.literal("Suren Karapetyan"),
  affiliation: z.literal(
    "Not affiliated with, endorsed by, sponsored by, or operated by the National Library of Armenia",
  ),
  contentRights: z.literal(
    "Technical access is not permission for reuse; source rights may be unknown",
  ),
  profile: z.literal("public-read"),
  upstreamReadiness: z.literal("not-checked"),
  transport: z.enum(["stdio", "http"]),
  apiBaseUrl: z.url(),
  capabilities: z.array(z.string()),
});
