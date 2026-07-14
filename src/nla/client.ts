import { randomUUID } from "node:crypto";
import type { NlaConfig } from "../config.js";
import { Logger } from "../observability/logger.js";
import { readResponseBytes } from "../security/content-limits.js";
import { sanitizeUnknown } from "../security/output-sanitizer.js";
import { UrlPolicy } from "../security/url-policy.js";
import { NlaError } from "./errors.js";
import type { NlaHttpResult, Source } from "./types.js";

type Fetch = typeof globalThis.fetch;
type HttpMethod = "GET" | "HEAD";

interface CacheEntry {
  bytes: Uint8Array;
  contentType: string;
  etag?: string;
  lastModified?: string;
  storedAt: number;
  status: number;
}

interface RequestOptions {
  query?: Record<
    string,
    string | number | boolean | readonly string[] | undefined
  >;
  signal?: AbortSignal | undefined;
  maxResponseBytes?: number;
  headers?: Readonly<Record<string, string>>;
}

class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async use<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    try {
      return await operation();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

function retryAfterMilliseconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(
        signal?.reason instanceof Error
          ? signal.reason
          : new Error("Request aborted"),
      );
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class NlaClient {
  readonly urlPolicy: UrlPolicy;
  private readonly semaphore: Semaphore;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    readonly config: NlaConfig,
    private readonly fetchImplementation: Fetch = globalThis.fetch,
    private readonly logger = new Logger("nla-client"),
  ) {
    this.urlPolicy = new UrlPolicy(config.apiBaseUrl, config.allowedHost);
    this.semaphore = new Semaphore(config.maxConcurrency);
  }

  async getJson<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<NlaHttpResult<T>> {
    const result = await this.request("GET", path, options);
    if (!result.contentType.includes("json") && result.bytes.byteLength > 0) {
      throw NlaError.invalidResponse("Expected JSON from the NLA API", {
        contentType: result.contentType,
      });
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        result.bytes,
      );
      const data: unknown = text === "" ? null : (JSON.parse(text) as unknown);
      return {
        data: sanitizeUnknown(data) as T,
        source: result.source,
        status: result.status,
        contentType: result.contentType,
        cacheHit: result.cacheHit,
      };
    } catch (error) {
      if (error instanceof NlaError) throw error;
      throw NlaError.invalidResponse("NLA returned malformed JSON", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async getBytes(
    path: string,
    options: RequestOptions = {},
  ): Promise<NlaHttpResult<Uint8Array>> {
    const result = await this.request("GET", path, {
      ...options,
      headers: { Accept: "*/*", ...options.headers },
    });
    return {
      data: result.bytes,
      source: result.source,
      status: result.status,
      contentType: result.contentType,
      cacheHit: result.cacheHit,
    };
  }

  async head(
    path: string,
    options: RequestOptions = {},
  ): Promise<NlaHttpResult<null>> {
    const result = await this.request("HEAD", path, options);
    return {
      data: null,
      source: result.source,
      status: result.status,
      contentType: result.contentType,
      cacheHit: false,
    };
  }

  private buildUrl(path: string, query: RequestOptions["query"]): URL {
    const url = this.urlPolicy.resolve(path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const entry of value) url.searchParams.append(key, String(entry));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async request(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
  ): Promise<{
    bytes: Uint8Array;
    source: Source;
    status: number;
    contentType: string;
    cacheHit: boolean;
  }> {
    const initialUrl = this.buildUrl(path, options.query);
    const cacheKey = initialUrl.toString();
    const cached =
      method === "GET" && this.config.cacheEnabled
        ? this.cache.get(cacheKey)
        : undefined;
    if (cached && Date.now() - cached.storedAt <= this.config.cacheTtlMs) {
      this.touchCache(cacheKey, cached);
      return this.fromCache(cacheKey, cached);
    }

    return this.semaphore.use(async () => {
      const requestId = randomUUID();
      const startedAt = performance.now();
      const timeoutSignal = AbortSignal.timeout(this.config.httpTimeoutMs);
      const signal = options.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;
      const headers = new Headers({
        Accept: "application/hal+json, application/json",
      });
      for (const [name, value] of Object.entries(options.headers ?? {}))
        headers.set(name, value);
      if (cached?.etag) headers.set("If-None-Match", cached.etag);
      if (cached?.lastModified)
        headers.set("If-Modified-Since", cached.lastModified);

      let retries = 0;
      let url = initialUrl;
      let redirects = 0;
      try {
        while (true) {
          let response: Response;
          try {
            response = await this.fetchImplementation(url, {
              method,
              headers,
              redirect: "manual",
              signal,
            });
          } catch (error) {
            if (signal.aborted) {
              if (options.signal?.aborted) throw options.signal.reason ?? error;
              throw new NlaError(
                "NLA_UPSTREAM_TIMEOUT",
                "NLA request timed out",
                {
                  timeoutMs: this.config.httpTimeoutMs,
                },
              );
            }
            if (retries < this.config.maxRetries) {
              retries += 1;
              await wait(this.backoff(retries), signal);
              continue;
            }
            throw new NlaError(
              "NLA_UPSTREAM_UNAVAILABLE",
              "Unable to reach the NLA API",
              {
                cause: error instanceof Error ? error.message : String(error),
              },
            );
          }

          if ([301, 302, 303, 307, 308].includes(response.status)) {
            if (redirects >= this.config.maxRedirects) {
              throw NlaError.invalidResponse(
                "NLA response exceeded the redirect limit",
              );
            }
            const location = response.headers.get("location");
            if (!location)
              throw NlaError.invalidResponse("NLA redirect omitted Location");
            url = new URL(location, url);
            this.urlPolicy.assertAllowed(url);
            redirects += 1;
            continue;
          }

          if (response.status === 304 && cached) {
            cached.storedAt = Date.now();
            return this.fromCache(cacheKey, cached);
          }

          if (
            [429, 502, 503, 504].includes(response.status) &&
            retries < this.config.maxRetries
          ) {
            retries += 1;
            const retryAfter = retryAfterMilliseconds(
              response.headers.get("retry-after"),
            );
            await wait(retryAfter ?? this.backoff(retries), signal);
            continue;
          }

          if (!response.ok)
            throw NlaError.fromStatus(
              response.status,
              response.headers.get("retry-after"),
            );

          const contentType =
            response.headers.get("content-type") ?? "application/octet-stream";
          const maximumBytes =
            options.maxResponseBytes ?? this.config.maxMetadataBytes;
          const bytes =
            method === "HEAD"
              ? new Uint8Array()
              : await readResponseBytes(response, maximumBytes);
          const source = this.sourceFrom(url, response.headers);
          const entry: CacheEntry = {
            bytes,
            contentType,
            storedAt: Date.now(),
            status: response.status,
            ...(response.headers.get("etag")
              ? { etag: response.headers.get("etag")! }
              : {}),
            ...(response.headers.get("last-modified")
              ? { lastModified: response.headers.get("last-modified")! }
              : {}),
          };
          if (method === "GET" && this.config.cacheEnabled)
            this.storeCache(cacheKey, entry);

          this.logger.info("upstream_request", {
            requestId,
            method,
            url: url.toString(),
            status: response.status,
            retries,
            redirects,
            bytes: bytes.byteLength,
            durationMs: Math.round(performance.now() - startedAt),
            cacheHit: false,
          });
          return {
            bytes,
            source,
            status: response.status,
            contentType,
            cacheHit: false,
          };
        }
      } catch (error) {
        this.logger.warn("upstream_request_failed", {
          requestId,
          method,
          url: url.toString(),
          retries,
          redirects,
          durationMs: Math.round(performance.now() - startedAt),
          errorCode: error instanceof NlaError ? error.code : "ABORTED",
        });
        throw error;
      }
    });
  }

  private sourceFrom(url: URL, headers: Headers): Source {
    return {
      repository: "National Library of Armenia",
      url: url.toString(),
      retrievedAt: new Date().toISOString(),
      ...(headers.get("etag") ? { etag: headers.get("etag")! } : {}),
      ...(headers.get("last-modified")
        ? { lastModified: headers.get("last-modified")! }
        : {}),
    };
  }

  private fromCache(cacheKey: string, cached: CacheEntry) {
    return {
      bytes: cached.bytes,
      source: {
        repository: "National Library of Armenia" as const,
        url: cacheKey,
        retrievedAt: new Date().toISOString(),
        ...(cached.etag ? { etag: cached.etag } : {}),
        ...(cached.lastModified ? { lastModified: cached.lastModified } : {}),
      },
      status: cached.status,
      contentType: cached.contentType,
      cacheHit: true,
    };
  }

  private touchCache(cacheKey: string, entry: CacheEntry): void {
    this.cache.delete(cacheKey);
    this.cache.set(cacheKey, entry);
  }

  private storeCache(cacheKey: string, entry: CacheEntry): void {
    this.touchCache(cacheKey, entry);
    while (this.cache.size > this.config.cacheMaxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private backoff(attempt: number): number {
    const base = Math.min(2_000, 150 * 2 ** (attempt - 1));
    return Math.round(base * (0.75 + Math.random() * 0.5));
  }
}
