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

export interface MetadataValue {
  value: string;
  language: string | null;
  authority: string | null;
  confidence: number;
  place: number;
  [key: string]: unknown;
}

export type MetadataMap = Record<string, MetadataValue[]>;

export interface DspaceObject extends HalDocument {
  id?: string;
  uuid?: string;
  name?: string;
  handle?: string | null;
  metadata?: MetadataMap;
  type: string;
  inArchive?: boolean;
  discoverable?: boolean;
  withdrawn?: boolean;
  lastModified?: string;
}

export interface Bitstream extends DspaceObject {
  type: "bitstream";
  uuid: string;
  name: string;
  bundleName?: string;
  sizeBytes: number;
  sequenceId?: number;
  checkSum?: {
    checkSumAlgorithm: string;
    value: string;
  };
}

export interface BitstreamFormat extends HalDocument {
  id: number;
  shortDescription: string;
  description: string;
  mimetype: string;
  supportLevel: string;
  internal: boolean;
  extensions: string[];
  type: "bitstreamformat";
}

export interface AccessStatus extends HalDocument {
  status: string;
  embargoDate: string | null;
  type: "accessStatus";
}

export type BundleClassification =
  "ORIGINAL" | "TEXT" | "THUMBNAIL" | "LICENSE" | "OTHER";

export interface ResolvedBitstream {
  uuid: string;
  filename: string;
  bundle: BundleClassification;
  mimeType: string;
  detectedMimeType: string | null;
  mimeVerification: "declared-unverified" | "verified";
  inlineEligible: boolean;
  sizeBytes: number;
  format: {
    id: number;
    name: string;
    description: string;
    supportLevel: string;
    extensions: string[];
  };
  access: {
    status: string;
    embargoDate: string | null;
    publiclyReadable: boolean;
  };
  checksum: Bitstream["checkSum"] | null;
  metadata: MetadataMap;
  resourceLink: {
    type: "resource_link";
    uri: string;
    name: string;
    description: string;
    mimeType: string;
    size: number;
  } | null;
  metadataResource: string;
  downloadUrl: string | null;
}

export interface NormalizedRights {
  status: "declared" | "unknown";
  statements: MetadataValue[];
  uris: MetadataValue[];
  holders: MetadataValue[];
  accessRights: MetadataValue[];
  licences: MetadataValue[];
  reusable: null;
}

export interface NormalizedMetadata {
  uuid: string;
  handle: string | null;
  title: MetadataValue[];
  authors: MetadataValue[];
  contributors: MetadataValue[];
  subjects: MetadataValue[];
  descriptions: MetadataValue[];
  abstracts: MetadataValue[];
  languages: MetadataValue[];
  dateIssued: MetadataValue[];
  publisher: MetadataValue[];
  publicationPlace: MetadataValue[];
  documentType: MetadataValue[];
  pages: MetadataValue[];
  identifiers: MetadataValue[];
  rights: NormalizedRights;
  canonicalUrl: string;
  lastModified: string | null;
  inArchive: boolean | null;
  discoverable: boolean | null;
  withdrawn: boolean | null;
}

export interface NormalizedDspaceObject {
  type: string;
  name: string | null;
  metadata: MetadataMap;
  normalized: NormalizedMetadata;
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
