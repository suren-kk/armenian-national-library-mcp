import { sanitizeUpstreamText } from "../security/output-sanitizer.js";
import type { NlaClient } from "./client.js";
import { NlaError } from "./errors.js";
import { getEmbedded, requireHalDocument, validatedLinks } from "./hal.js";
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

export interface BundleWithFiles {
  uuid: string;
  name: string;
  classification: BundleClassification;
  files: ResolvedBitstream[];
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
  resourceLink: ResolvedBitstream["resourceLink"];
  downloadUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function asBitstream(value: unknown): Bitstream {
  if (
    !isRecord(value) ||
    value.type !== "bitstream" ||
    typeof value.uuid !== "string" ||
    typeof value.name !== "string" ||
    typeof value.sizeBytes !== "number"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace bitstream record");
  }
  return value as unknown as Bitstream;
}

function asBundle(
  value: unknown,
): DspaceObject & { uuid: string; name: string } {
  if (
    !isRecord(value) ||
    value.type !== "bundle" ||
    typeof value.uuid !== "string" ||
    typeof value.name !== "string"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace bundle record");
  }
  return value as unknown as DspaceObject & { uuid: string; name: string };
}

function asFormat(value: unknown): BitstreamFormat {
  if (
    !isRecord(value) ||
    value.type !== "bitstreamformat" ||
    typeof value.id !== "number" ||
    typeof value.mimetype !== "string"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace bitstream format record");
  }
  return value as unknown as BitstreamFormat;
}

function asAccessStatus(value: unknown): AccessStatus {
  if (
    !isRecord(value) ||
    value.type !== "accessStatus" ||
    typeof value.status !== "string"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace access status record");
  }
  return value as unknown as AccessStatus;
}

export class NlaContentResolver {
  constructor(private readonly client: NlaClient) {}

  async listItemFiles(
    itemUuid: string,
    signal?: AbortSignal,
  ): Promise<Envelope<BundleWithFiles[]>> {
    assertUuid(itemUuid, "Item UUID");
    const response = await this.client.getJson<unknown>(
      `core/items/${itemUuid}/bundles`,
      {
        query: { page: 0, size: this.client.config.maxPageSize },
        signal,
      },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const bundles = getEmbedded<unknown>(document, "bundles").map(asBundle);
    const resolved = await Promise.all(
      bundles.map(async (bundle) => ({
        uuid: bundle.uuid,
        name: bundle.name,
        classification: classifyBundle(bundle.name),
        files: await this.listBundleBitstreams(bundle.uuid, signal),
      })),
    );
    return this.envelope(
      resolved,
      paginationFrom(document),
      response.source,
      [],
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
    return this.getBitstream(uuid, signal);
  }

  async getItemText(
    options: ItemTextOptions,
    signal?: AbortSignal,
  ): Promise<Envelope<ItemTextData>> {
    const maximumChars = Math.min(
      options.maxChars,
      this.client.config.maxTextChars,
    );
    const files = await this.listItemFiles(options.itemUuid, signal);
    const textFiles = files.data
      .filter((bundle) => bundle.classification === "TEXT")
      .flatMap((bundle) => bundle.files)
      .filter((file) => file.mimeType.toLowerCase().startsWith("text/plain"));
    const selected = options.bitstreamUuid
      ? textFiles.find((file) => file.uuid === options.bitstreamUuid)
      : textFiles[0];
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
    const content = await this.client.getBytes(
      `core/bitstreams/${selected.uuid}/content`,
      {
        signal,
        maxResponseBytes: this.client.config.maxMetadataBytes,
      },
    );
    if (!content.contentType.toLowerCase().startsWith("text/plain")) {
      throw NlaError.invalidResponse(
        "NLA text bitstream content is not text/plain",
        {
          contentType: content.contentType,
        },
      );
    }
    const decoded = sanitizeUpstreamText(
      new TextDecoder("utf-8", { fatal: false }).decode(content.data),
    );
    const chunk = chunkUnicode(decoded, options.offsetChars, maximumChars);
    const warnings =
      options.maxChars > maximumChars
        ? [`max_chars was capped at ${maximumChars}`]
        : [];
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
    );
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
    const isText = bitstream.mimeType.toLowerCase().startsWith("text/plain");
    const byteLimit = isText
      ? this.client.config.maxMetadataBytes
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
    return { bitstream, bytes: content.data, source: content.source };
  }

  private async listBundleBitstreams(
    bundleUuid: string,
    signal?: AbortSignal,
  ): Promise<ResolvedBitstream[]> {
    const response = await this.client.getJson<unknown>(
      `core/bundles/${bundleUuid}/bitstreams`,
      {
        query: { page: 0, size: this.client.config.maxPageSize },
        signal,
      },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const bitstreams = getEmbedded<unknown>(document, "bitstreams").map(
      asBitstream,
    );
    return Promise.all(
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
  }

  private resolveBitstream(
    bitstream: Bitstream,
    format: BitstreamFormat,
    access: AccessStatus,
  ): ResolvedBitstream {
    const downloadUrl = `${this.client.config.apiBaseUrl}/core/bitstreams/${bitstream.uuid}/content`;
    return {
      uuid: bitstream.uuid,
      filename: bitstream.name,
      bundle: classifyBundle(bitstream.bundleName),
      mimeType: format.mimetype,
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
        publiclyReadable: access.status === "open.access",
      },
      checksum: bitstream.checkSum ?? null,
      metadata: bitstream.metadata ?? {},
      resourceLink: {
        type: "resource_link",
        uri: `nla://bitstream/${bitstream.uuid}/content`,
        name: bitstream.name,
        description: `NLA ${classifyBundle(bitstream.bundleName)} bitstream content`,
        mimeType: format.mimetype,
        size: bitstream.sizeBytes,
      },
      metadataResource: `nla://bitstream/${bitstream.uuid}`,
      downloadUrl,
    };
  }

  private envelope<T>(
    data: T,
    pagination: Pagination | null,
    source: Source,
    warnings: string[],
  ): Envelope<T> {
    return {
      data,
      pagination,
      source,
      warnings,
      truncated: warnings.length > 0,
    };
  }
}
