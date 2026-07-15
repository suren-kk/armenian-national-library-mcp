import { sanitizeUpstreamText } from "../security/output-sanitizer.js";
import {
  assertSafeFilename,
  detectFileMimeType,
  isInlineMimeTypeAllowed,
  normalizeMimeType,
} from "../security/content-limits.js";
import type { NlaClient } from "./client.js";
import { NlaError } from "./errors.js";
import { getEmbedded, requireHalDocument, validatedLinks } from "./hal.js";
import {
  parseAccessStatus,
  parseBitstream,
  parseBitstreamFormat,
  parseDspaceObject,
} from "./upstream-schemas.js";
import type {
  AccessStatus,
  Bitstream,
  BitstreamFormat,
  BundleClassification,
  DspaceObject,
  Envelope,
  Pagination,
  ResolvedBitstream,
  Source,
} from "./types.js";
import { paginationFrom } from "./pagination.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_DISCOVERY_MAX_RECORDS = 500;
const TEXT_DISCOVERY_MAX_PAGES = 20;

export interface BundleWithFiles {
  uuid: string;
  name: string;
  classification: BundleClassification;
  files: ResolvedBitstream[];
  filesTruncated: boolean;
  filesPagination: Pagination | null;
}

export interface ItemFilesPageOptions {
  bundlePage: number;
  bundlePageSize: number;
  bitstreamPage: number;
  bitstreamPageSize: number;
}

export interface ItemTextOptions {
  itemUuid: string;
  bitstreamUuid?: string | undefined;
  offsetChars: number;
  maxChars: number;
}

export interface ItemTextData {
  itemUuid: string;
  bitstreamUuid: string;
  filename: string;
  mimeType: "text/plain";
  text: string;
  offsetChars: number;
  returnedChars: number;
  totalChars: number;
  nextOffset: number | null;
  provenance: {
    kind: "nla-provided-extracted-text";
    label: "NLA-provided extracted text";
    bundle: "TEXT";
    derivedLocally: false;
    untrustedSourceData: true;
  };
  resourceLink: NonNullable<ResolvedBitstream["resourceLink"]>;
  downloadUrl: string;
}

function assertUuid(uuid: string, label = "UUID"): void {
  if (!UUID_PATTERN.test(uuid)) {
    throw NlaError.invalidResponse(`${label} is not a valid DSpace UUID`);
  }
}

export function classifyBundle(name: string | undefined): BundleClassification {
  switch (name?.trim().toUpperCase()) {
    case "ORIGINAL":
      return "ORIGINAL";
    case "TEXT":
      return "TEXT";
    case "THUMBNAIL":
      return "THUMBNAIL";
    case "LICENSE":
      return "LICENSE";
    default:
      return "OTHER";
  }
}

export function chunkUnicode(
  text: string,
  offsetChars: number,
  maximumChars: number,
): { text: string; totalChars: number; nextOffset: number | null } {
  const characters = Array.from(text);
  if (offsetChars > characters.length) {
    throw NlaError.invalidResponse(
      "offset_chars exceeds the extracted text length",
      {
        offsetChars,
        totalChars: characters.length,
      },
    );
  }
  const end = Math.min(characters.length, offsetChars + maximumChars);
  return {
    text: characters.slice(offsetChars, end).join(""),
    totalChars: characters.length,
    nextOffset: end < characters.length ? end : null,
  };
}

export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return sanitizeUpstreamText(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
  } catch (error) {
    throw NlaError.invalidResponse("NLA text bitstream is not valid UTF-8", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function asBitstream(value: unknown): Bitstream {
  const bitstream = parseBitstream(value);
  assertUuid(bitstream.uuid, "Bitstream UUID");
  assertSafeFilename(bitstream.name);
  return bitstream;
}

function asBundle(
  value: unknown,
): DspaceObject & { uuid: string; name: string } {
  const object = parseDspaceObject(value);
  if (
    object.type !== "bundle" ||
    typeof object.uuid !== "string" ||
    typeof object.name !== "string"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace bundle record");
  }
  assertUuid(object.uuid, "Bundle UUID");
  return { ...object, uuid: object.uuid, name: object.name };
}

function asFormat(value: unknown): BitstreamFormat {
  return parseBitstreamFormat(value);
}

function asAccessStatus(value: unknown): AccessStatus {
  return parseAccessStatus(value);
}

export class NlaContentResolver {
  private readonly decodedTextCache = new Map<
    string,
    { text: string; estimatedBytes: number }
  >();
  private decodedTextCacheBytes = 0;

  constructor(private readonly client: NlaClient) {}

  async listItemFiles(
    itemUuid: string,
    options: ItemFilesPageOptions = {
      bundlePage: 0,
      bundlePageSize: this.client.config.maxPageSize,
      bitstreamPage: 0,
      bitstreamPageSize: this.client.config.maxPageSize,
    },
    signal?: AbortSignal,
  ): Promise<Envelope<BundleWithFiles[]>> {
    assertUuid(itemUuid, "Item UUID");
    const bundlePageSize = Math.min(
      options.bundlePageSize,
      this.client.config.maxPageSize,
    );
    const bitstreamPageSize = Math.min(
      options.bitstreamPageSize,
      this.client.config.maxPageSize,
    );
    const bundlePage = await this.listBundlesPage(
      itemUuid,
      options.bundlePage,
      bundlePageSize,
      signal,
    );
    const bundleResults = await Promise.all(
      bundlePage.bundles.map(async (bundle) => {
        const bitstreams = await this.listBundleBitstreams(
          bundle.uuid,
          options.bitstreamPage,
          bitstreamPageSize,
          signal,
        );
        return {
          uuid: bundle.uuid,
          name: bundle.name,
          classification: classifyBundle(bundle.name),
          files: bitstreams.files,
          filesTruncated: bitstreams.pagination?.hasNext ?? false,
          filesPagination: bitstreams.pagination,
        };
      }),
    );
    const warnings: string[] = [];
    if (options.bundlePageSize > bundlePageSize) {
      warnings.push(`bundle_page_size was capped at ${bundlePageSize}`);
    }
    if (options.bitstreamPageSize > bitstreamPageSize) {
      warnings.push(`bitstream_page_size was capped at ${bitstreamPageSize}`);
    }
    if (bundlePage.pagination?.hasNext) {
      warnings.push("More bundle pages are available via bundle_page");
    }
    for (const bundle of bundleResults) {
      if (bundle.filesTruncated) {
        warnings.push(
          `More files in bundle ${bundle.name} are available via bitstream_page`,
        );
      }
    }
    return this.envelope(
      bundleResults,
      bundlePage.pagination,
      bundlePage.source,
      warnings,
      (bundlePage.pagination?.hasNext ?? false) ||
        bundleResults.some((bundle) => bundle.filesTruncated),
    );
  }

  async getBitstream(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<Envelope<ResolvedBitstream>> {
    assertUuid(uuid, "Bitstream UUID");
    const [metadataResponse, formatResponse, accessResponse] =
      await Promise.all([
        this.client.getJson<unknown>(`core/bitstreams/${uuid}`, { signal }),
        this.client.getJson<unknown>(`core/bitstreams/${uuid}/format`, {
          signal,
        }),
        this.client.getJson<unknown>(`core/bitstreams/${uuid}/accessStatus`, {
          signal,
        }),
      ]);
    const metadataDocument = requireHalDocument(metadataResponse.data);
    validatedLinks(metadataDocument, this.client.urlPolicy);
    const bitstream = asBitstream(metadataDocument);
    const format = asFormat(formatResponse.data);
    const access = asAccessStatus(accessResponse.data);
    return this.envelope(
      this.resolveBitstream(bitstream, format, access),
      null,
      metadataResponse.source,
      [],
    );
  }

  async getFileDownload(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<Envelope<ResolvedBitstream>> {
    const result = await this.getBitstream(uuid, signal);
    if (!result.data.access.publiclyReadable) {
      throw new NlaError(
        "NLA_ACCESS_RESTRICTED",
        "The selected bitstream is restricted",
        { accessStatus: result.data.access.status },
      );
    }
    if (!result.data.downloadUrl) {
      throw NlaError.invalidResponse(
        "A public bitstream did not produce a safe download link",
      );
    }
    return result;
  }

  async getItemText(
    options: ItemTextOptions,
    signal?: AbortSignal,
  ): Promise<Envelope<ItemTextData>> {
    const maximumChars = Math.min(
      options.maxChars,
      this.client.config.maxTextChars,
    );
    const selected = await this.findTextBitstream(
      options.itemUuid,
      options.bitstreamUuid,
      signal,
    );
    if (!selected) {
      throw new NlaError(
        "NLA_NOT_FOUND",
        options.bitstreamUuid
          ? "The requested bitstream is not a text/plain file in this item's TEXT bundle"
          : "This item has no NLA-provided text/plain extraction",
      );
    }
    if (!selected.access.publiclyReadable) {
      throw new NlaError(
        "NLA_ACCESS_RESTRICTED",
        "The selected text bitstream is restricted",
        {
          accessStatus: selected.access.status,
        },
      );
    }
    if (!selected.resourceLink || !selected.downloadUrl) {
      throw NlaError.invalidResponse(
        "A public text bitstream did not produce safe content links",
      );
    }
    const content = await this.client.getBytes(
      `core/bitstreams/${selected.uuid}/content`,
      {
        signal,
        maxResponseBytes: this.client.config.maxTextBytes,
      },
    );
    if (normalizeMimeType(content.contentType) !== "text/plain") {
      throw NlaError.invalidResponse(
        "NLA text bitstream content is not text/plain",
        {
          contentType: content.contentType,
        },
      );
    }
    const decoded = this.decodeTextContent(selected.uuid, content);
    const chunk = chunkUnicode(decoded, options.offsetChars, maximumChars);
    const warnings: string[] = [];
    if (options.maxChars > maximumChars) {
      warnings.push(`max_chars was capped at ${maximumChars}`);
    }
    return this.envelope(
      {
        itemUuid: options.itemUuid,
        bitstreamUuid: selected.uuid,
        filename: selected.filename,
        mimeType: "text/plain",
        text: chunk.text,
        offsetChars: options.offsetChars,
        returnedChars: Array.from(chunk.text).length,
        totalChars: chunk.totalChars,
        nextOffset: chunk.nextOffset,
        provenance: {
          kind: "nla-provided-extracted-text",
          label: "NLA-provided extracted text",
          bundle: "TEXT",
          derivedLocally: false,
          untrustedSourceData: true,
        },
        resourceLink: selected.resourceLink,
        downloadUrl: selected.downloadUrl,
      },
      null,
      content.source,
      warnings,
      chunk.nextOffset !== null || warnings.length > 0,
    );
  }

  private decodeTextContent(
    bitstreamUuid: string,
    content: Awaited<ReturnType<NlaClient["getBytes"]>>,
  ): string {
    const validator = content.source.etag ?? content.source.lastModified;
    const cacheKey = validator ? `${bitstreamUuid}\n${validator}` : null;
    if (cacheKey && this.client.config.cacheEnabled) {
      const cached = this.decodedTextCache.get(cacheKey);
      if (cached) {
        this.decodedTextCache.delete(cacheKey);
        this.decodedTextCache.set(cacheKey, cached);
        return cached.text;
      }
    }

    const text = decodeUtf8(content.data);
    if (!cacheKey || !this.client.config.cacheEnabled) return text;

    for (const [key, entry] of this.decodedTextCache) {
      if (key.startsWith(`${bitstreamUuid}\n`) && key !== cacheKey) {
        this.decodedTextCache.delete(key);
        this.decodedTextCacheBytes -= entry.estimatedBytes;
      }
    }
    const estimatedBytes = text.length * 2;
    if (estimatedBytes > this.client.config.cacheMaxBytes) return text;
    this.decodedTextCache.set(cacheKey, { text, estimatedBytes });
    this.decodedTextCacheBytes += estimatedBytes;
    while (
      this.decodedTextCache.size > this.client.config.cacheMaxEntries ||
      this.decodedTextCacheBytes > this.client.config.cacheMaxBytes
    ) {
      const oldestKey = this.decodedTextCache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      const oldest = this.decodedTextCache.get(oldestKey);
      this.decodedTextCache.delete(oldestKey);
      if (oldest) this.decodedTextCacheBytes -= oldest.estimatedBytes;
    }
    return text;
  }

  async readBitstreamContent(
    uuid: string,
    signal?: AbortSignal,
  ): Promise<{
    bitstream: ResolvedBitstream;
    bytes: Uint8Array;
    source: Source;
  }> {
    const metadata = await this.getBitstream(uuid, signal);
    const bitstream = metadata.data;
    if (!bitstream.access.publiclyReadable) {
      throw new NlaError(
        "NLA_ACCESS_RESTRICTED",
        "The selected bitstream is restricted",
        {
          accessStatus: bitstream.access.status,
        },
      );
    }
    const declaredMimeType = normalizeMimeType(bitstream.mimeType);
    if (!isInlineMimeTypeAllowed(declaredMimeType)) {
      throw NlaError.invalidResponse(
        "This MIME type is not eligible for inline MCP content",
        { declaredMimeType },
      );
    }
    const isText = declaredMimeType === "text/plain";
    const byteLimit = isText
      ? this.client.config.maxTextBytes
      : this.client.config.maxInlineBinaryBytes;
    if (!isText && bitstream.sizeBytes > byteLimit) {
      throw NlaError.responseTooLarge(byteLimit, bitstream.sizeBytes);
    }
    const content = await this.client.getBytes(
      `core/bitstreams/${uuid}/content`,
      {
        signal,
        maxResponseBytes: byteLimit,
      },
    );
    const responseMimeType = normalizeMimeType(content.contentType);
    if (responseMimeType !== declaredMimeType) {
      throw NlaError.invalidResponse(
        "Bitstream response MIME type does not match its metadata",
        { declaredMimeType, responseMimeType },
      );
    }
    let detectedMimeType: string | null;
    if (isText) {
      decodeUtf8(content.data);
      detectedMimeType = "text/plain";
    } else {
      detectedMimeType = detectFileMimeType(content.data);
    }
    if (detectedMimeType !== declaredMimeType) {
      throw NlaError.invalidResponse(
        "Bitstream bytes do not match the declared MIME type",
        { declaredMimeType, detectedMimeType },
      );
    }
    return {
      bitstream: {
        ...bitstream,
        detectedMimeType,
        mimeVerification: "verified",
      },
      bytes: content.data,
      source: content.source,
    };
  }

  private async listBundleBitstreams(
    bundleUuid: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<{ files: ResolvedBitstream[]; pagination: Pagination | null }> {
    const response = await this.client.getJson<unknown>(
      `core/bundles/${bundleUuid}/bitstreams`,
      {
        query: { page, size: pageSize },
        signal,
      },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const pagination = paginationFrom(document);
    const bitstreams = getEmbedded<unknown>(document, "bitstreams").map(
      asBitstream,
    );
    const files = await Promise.all(
      bitstreams.map(async (bitstream) => {
        const [formatResponse, accessResponse] = await Promise.all([
          this.client.getJson<unknown>(
            `core/bitstreams/${bitstream.uuid}/format`,
            { signal },
          ),
          this.client.getJson<unknown>(
            `core/bitstreams/${bitstream.uuid}/accessStatus`,
            { signal },
          ),
        ]);
        return this.resolveBitstream(
          bitstream,
          asFormat(formatResponse.data),
          asAccessStatus(accessResponse.data),
        );
      }),
    );
    return { files, pagination };
  }

  private async listBundlesPage(
    itemUuid: string,
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<{
    bundles: Array<DspaceObject & { uuid: string; name: string }>;
    pagination: Pagination | null;
    source: Source;
  }> {
    const response = await this.client.getJson<unknown>(
      `core/items/${itemUuid}/bundles`,
      { query: { page, size: pageSize }, signal },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    return {
      bundles: getEmbedded<unknown>(document, "bundles").map(asBundle),
      pagination: paginationFrom(document),
      source: response.source,
    };
  }

  private async findTextBitstream(
    itemUuid: string,
    requestedUuid: string | undefined,
    signal?: AbortSignal,
  ): Promise<ResolvedBitstream | undefined> {
    const pageSize = this.client.config.maxPageSize;
    let inspected = 0;
    let inspectedPages = 0;
    let bundlePageNumber = 0;
    while (true) {
      const bundlePage = await this.listBundlesPage(
        itemUuid,
        bundlePageNumber,
        pageSize,
        signal,
      );
      inspectedPages += 1;
      if (inspectedPages > TEXT_DISCOVERY_MAX_PAGES) {
        throw new NlaError(
          "NLA_RESPONSE_TOO_LARGE",
          "Text discovery exceeded its bounded page limit; select a bitstream UUID from list_item_files",
          { pageLimit: TEXT_DISCOVERY_MAX_PAGES },
        );
      }
      inspected += bundlePage.bundles.length;
      for (const bundle of bundlePage.bundles) {
        if (classifyBundle(bundle.name) !== "TEXT") continue;
        let bitstreamPageNumber = 0;
        while (true) {
          const bitstreamPage = await this.listBundleBitstreams(
            bundle.uuid,
            bitstreamPageNumber,
            pageSize,
            signal,
          );
          inspectedPages += 1;
          if (inspectedPages > TEXT_DISCOVERY_MAX_PAGES) {
            throw new NlaError(
              "NLA_RESPONSE_TOO_LARGE",
              "Text discovery exceeded its bounded page limit; select a bitstream UUID from list_item_files",
              { pageLimit: TEXT_DISCOVERY_MAX_PAGES },
            );
          }
          inspected += bitstreamPage.files.length;
          if (inspected > TEXT_DISCOVERY_MAX_RECORDS) {
            throw new NlaError(
              "NLA_RESPONSE_TOO_LARGE",
              "Text discovery exceeded its bounded record limit; select a bitstream UUID from list_item_files",
              { recordLimit: TEXT_DISCOVERY_MAX_RECORDS },
            );
          }
          const selected = bitstreamPage.files.find(
            (file) =>
              normalizeMimeType(file.mimeType) === "text/plain" &&
              (requestedUuid === undefined || file.uuid === requestedUuid),
          );
          if (selected) return selected;
          if (!bitstreamPage.pagination?.hasNext) break;
          bitstreamPageNumber += 1;
        }
      }
      if (!bundlePage.pagination?.hasNext) return undefined;
      bundlePageNumber += 1;
    }
  }

  private resolveBitstream(
    bitstream: Bitstream,
    format: BitstreamFormat,
    access: AccessStatus,
  ): ResolvedBitstream {
    const publiclyReadable = access.status === "open.access";
    const inlineEligible = isInlineMimeTypeAllowed(format.mimetype);
    const downloadUrl = publiclyReadable
      ? `${this.client.config.apiBaseUrl}/core/bitstreams/${bitstream.uuid}/content`
      : null;
    return {
      uuid: bitstream.uuid,
      filename: bitstream.name,
      bundle: classifyBundle(bitstream.bundleName),
      mimeType: format.mimetype,
      detectedMimeType: null,
      mimeVerification: "declared-unverified",
      inlineEligible,
      sizeBytes: bitstream.sizeBytes,
      format: {
        id: format.id,
        name: format.shortDescription,
        description: format.description,
        supportLevel: format.supportLevel,
        extensions: format.extensions,
      },
      access: {
        status: access.status,
        embargoDate: access.embargoDate,
        publiclyReadable,
      },
      checksum: bitstream.checkSum ?? null,
      metadata: bitstream.metadata ?? {},
      resourceLink:
        publiclyReadable && inlineEligible
          ? {
              type: "resource_link",
              uri: `nla://bitstream/${bitstream.uuid}/content`,
              name: bitstream.name,
              description: `NLA ${classifyBundle(bitstream.bundleName)} bitstream content`,
              mimeType: format.mimetype,
              size: bitstream.sizeBytes,
            }
          : null,
      metadataResource: `nla://bitstream/${bitstream.uuid}`,
      downloadUrl,
    };
  }

  private envelope<T>(
    data: T,
    pagination: Pagination | null,
    source: Source,
    warnings: string[],
    truncated = warnings.length > 0,
  ): Envelope<T> {
    return {
      data,
      pagination,
      source,
      warnings,
      truncated,
    };
  }
}
