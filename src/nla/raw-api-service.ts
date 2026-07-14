import { assertRawApiPath } from "../security/raw-api-policy.js";
import { sanitizeUnknown } from "../security/output-sanitizer.js";
import { decodeUtf8 } from "./content-resolver.js";
import type { NlaClient } from "./client.js";
import type { EndpointRecord } from "./endpoint-registry.js";
import { NlaError } from "./errors.js";
import { isHalDocument } from "./hal.js";
import { paginationFrom } from "./pagination.js";
import type { Envelope, Pagination, Source } from "./types.js";

export interface RawApiOptions {
  method: "GET" | "HEAD";
  path: string;
  query: Record<
    string,
    string | number | boolean | readonly string[] | undefined
  >;
  page?: number | undefined;
  pageSize?: number | undefined;
  maxResponseBytes?: number | undefined;
}

export class NlaRawApiService {
  constructor(
    private readonly client: NlaClient,
    private readonly endpoints: readonly EndpointRecord[],
  ) {}

  async get(
    options: RawApiOptions,
    signal?: AbortSignal,
  ): Promise<Envelope<unknown>> {
    assertRawApiPath(options.path, this.endpoints);
    const pageSize =
      options.pageSize === undefined
        ? undefined
        : Math.min(options.pageSize, this.client.config.maxPageSize);
    const maximumBytes = Math.min(
      options.maxResponseBytes ?? this.client.config.maxMetadataBytes,
      this.client.config.maxMetadataBytes,
    );
    const query = {
      ...options.query,
      ...(options.page !== undefined ? { page: options.page } : {}),
      ...(pageSize !== undefined ? { size: pageSize } : {}),
    };
    const path = options.path === "/" ? "" : options.path;
    const warnings: string[] = [];
    if (
      options.pageSize !== undefined &&
      options.pageSize > this.client.config.maxPageSize
    ) {
      warnings.push(`page_size was capped at ${pageSize}`);
    }
    if (
      options.maxResponseBytes !== undefined &&
      options.maxResponseBytes > maximumBytes
    ) {
      warnings.push(`max_response_bytes was capped at ${maximumBytes}`);
    }
    if (options.method === "HEAD") {
      const response = await this.client.head(path, { query, signal });
      return envelope(
        {
          method: "HEAD",
          path: options.path,
          status: response.status,
          contentType: response.contentType,
          body: null,
        },
        null,
        response.source,
        warnings,
      );
    }
    const response = await this.client.getBytes(path, {
      query,
      signal,
      maxResponseBytes: maximumBytes,
      headers: { Accept: "application/hal+json, application/json, text/plain" },
    });
    const contentType = (response.contentType.split(";", 1)[0] ?? "")
      .trim()
      .toLowerCase();
    const isJson =
      contentType === "application/json" || contentType.endsWith("+json");
    let body: unknown;
    if (isJson) {
      try {
        body = sanitizeUnknown(
          JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(response.data),
          ) as unknown,
        );
      } catch (error) {
        throw NlaError.invalidResponse(
          "Raw NLA endpoint returned malformed JSON",
          {
            cause: error instanceof Error ? error.message : String(error),
          },
        );
      }
    } else if (contentType === "text/plain") {
      body = decodeUtf8(response.data);
    } else {
      throw NlaError.invalidResponse(
        "nla_api_get only returns JSON or plain text; use content tools for files",
        { contentType: response.contentType },
      );
    }
    return envelope(
      {
        method: "GET",
        path: options.path,
        status: response.status,
        contentType: response.contentType,
        body,
      },
      isHalDocument(body) ? paginationFrom(body) : null,
      response.source,
      warnings,
    );
  }
}

function envelope<T>(
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
