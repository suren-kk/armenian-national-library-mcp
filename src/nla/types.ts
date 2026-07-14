export interface HalLink {
  href: string;
  templated?: boolean;
  name?: string;
  [key: string]: unknown;
}

export type HalLinkValue = HalLink | HalLink[];

export interface HalDocument {
  _embedded?: Record<string, unknown>;
  _links?: Record<string, HalLinkValue>;
  page?: DspacePage;
  [key: string]: unknown;
}

export interface DspacePage {
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}

export interface Source {
  repository: "National Library of Armenia";
  url: string;
  retrievedAt: string;
  etag?: string;
  lastModified?: string;
}

export interface Envelope<T> {
  data: T;
  pagination: Pagination | null;
  source: Source;
  warnings: string[];
  truncated: boolean;
}

export interface NlaHttpResult<T> {
  data: T;
  source: Source;
  status: number;
  contentType: string;
  cacheHit: boolean;
}
export type {
  AccessStatus,
  Bitstream,
  BitstreamFormat,
  DspaceObject,
  MetadataMap,
  MetadataValue,
} from "./upstream-schemas.js";
export type {
  BundleClassification,
  NormalizedDspaceObject,
  NormalizedMetadata,
  NormalizedRights,
  ResolvedBitstream,
} from "./domain-schemas.js";
