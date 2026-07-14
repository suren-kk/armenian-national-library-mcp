import { z } from "zod";
import {
  filterSchema,
  pageSchema,
  pageSizeSchema,
  uuidSchema,
} from "./common.js";

export const searchCatalogInput = z.object({
  query: z.string().min(1).max(2_000),
  dso_type: z.enum(["item", "collection", "community", "all"]).default("item"),
  scope_uuid: uuidSchema.optional(),
  page: pageSchema,
  page_size: pageSizeSchema,
  sort: z.string().min(1).max(100).optional(),
  filters: z.array(filterSchema).max(20).default([]),
  include_metadata: z.boolean().default(true),
});

export const searchFacetsInput = z.object({
  facet: z.string().min(1).max(100).optional(),
  query: z.string().max(2_000).optional(),
  scope_uuid: uuidSchema.optional(),
  page: pageSchema,
  page_size: pageSizeSchema,
});

export const browseCatalogInput = z.object({
  index: z.enum(["dateissued", "author", "title", "subject", "srsc"]),
  filter_value: z.string().min(1).max(1_000).optional(),
  scope_uuid: uuidSchema.optional(),
  page: pageSchema,
  page_size: pageSizeSchema,
  sort: z.string().min(1).max(100).optional(),
});

export const pagedInput = z.object({
  page: pageSchema,
  page_size: pageSizeSchema,
});
export const uuidInput = z.object({ uuid: uuidSchema });
export const itemIdInput = z.object({ item_id: z.string().min(1).max(500) });
export const itemTextInput = z.object({
  item_id: z.string().min(1).max(500),
  bitstream_uuid: uuidSchema.optional(),
  offset_chars: z.number().int().min(0).default(0),
  max_chars: z.number().int().min(1).default(20_000),
});
export const bitstreamInput = z.object({ bitstream_uuid: uuidSchema });
export const identifierInput = z.object({
  identifier: z.string().min(1).max(500),
});

export const collectionItemsInput = z.object({
  collection_uuid: uuidSchema,
  query: z.string().min(1).max(2_000).default("*"),
  page: pageSchema,
  page_size: pageSizeSchema,
  sort: z.string().min(1).max(100).optional(),
});

export const communityChildrenInput = z.object({
  community_uuid: uuidSchema,
  page: pageSchema,
  page_size: pageSizeSchema,
});
