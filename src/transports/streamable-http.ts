import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer as createNodeServer,
  type IncomingMessage,
  type RequestListener,
  type Server as NodeHttpServer,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { NlaClient } from "../nla/client.js";
import { Logger } from "../observability/logger.js";
import { HttpConcurrencyLimiter } from "../security/concurrency-limiter.js";
import { HttpRequestPolicy } from "../security/http-request-policy.js";
import { HttpRateLimiter } from "../security/rate-limiter.js";
import { createServer } from "../server/create-server.js";

const MCP_PATH = "/mcp";
const HEALTH_PATH = "/healthz";
const READINESS_PATH = "/readyz";
const READINESS_CACHE_MS = 5_000;

class RequestBodyError extends Error {
  constructor(
    readonly kind: "invalid" | "too-large" | "unsupported-encoding" | "timeout",
    message: string,
  ) {
    super(message);
  }
}

export interface HttpApplicationDependencies {
  client?: NlaClient;
  createMcpServer?: () => McpServer;
  readinessCheck?: () => Promise<void>;
  now?: () => number;
  logger?: Logger;
}

export interface HttpApplication {
  handler: RequestListener;
  close(): Promise<void>;
}

export interface StreamableHttpRuntime {
  server: NodeHttpServer;
  host: string;
  port: number;
  mcpUrl: string;
  close(): Promise<void>;
}

function jsonResponse(
  response: ServerResponse,
  status: number,
  value: unknown,
  headOnly = false,
): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(headOnly ? undefined : body);
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}

function hasSupportedJsonMediaType(request: IncomingMessage): boolean {
  const contentTypeHeaders: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === "content-type") {
      contentTypeHeaders.push(request.rawHeaders[index + 1] ?? "");
    }
  }
  if (contentTypeHeaders.length !== 1) return false;
  const [mediaType, ...parameters] = contentTypeHeaders[0]!
    .split(";")
    .map((value) => value.trim().toLowerCase());
  return (
    mediaType === "application/json" &&
    parameters.every((value) => value === "charset=utf-8")
  );
}

function hasValidBearerToken(
  request: IncomingMessage,
  expectedToken: string,
): boolean {
  const authorization = request.headers.authorization;
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ")
  ) {
    return false;
  }
  const suppliedToken = authorization.slice("Bearer ".length);
  const expected = createHash("sha256").update(expectedToken).digest();
  const supplied = createHash("sha256").update(suppliedToken).digest();
  return timingSafeEqual(expected, supplied);
}

function mcpError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  jsonResponse(response, status, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  });
}

function closeConnectionAfterResponse(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.setHeader("Connection", "close");
  response.once("finish", () => request.destroy());
}

async function readJsonBody(
  request: IncomingMessage,
  maximumBytes: number,
  timeoutMs: number,
): Promise<unknown> {
  const encoding = request.headers["content-encoding"];
  if (encoding && encoding.toLowerCase() !== "identity") {
    throw new RequestBodyError(
      "unsupported-encoding",
      "Compressed request bodies are not supported",
    );
  }
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength)) {
      throw new RequestBodyError("invalid", "Invalid Content-Length");
    }
    if (Number(contentLength) > maximumBytes) {
      throw new RequestBodyError("too-large", "Request body is too large");
    }
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => fail(new RequestBodyError("timeout", "Request body timed out")),
      timeoutMs,
    );
    const cleanup = () => {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
    };
    const fail = (error: Error) => {
      cleanup();
      request.pause();
      reject(error);
    };
    const onData = (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > maximumBytes) {
        fail(new RequestBodyError("too-large", "Request body is too large"));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new Error("Request was aborted"));
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
    request.on("aborted", onAborted);
  });

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, total),
    );
    return JSON.parse(text) as unknown;
  } catch {
    throw new RequestBodyError("invalid", "Request body is not valid JSON");
  }
}

function setCorsHeaders(
  response: ServerResponse,
  allowedOrigin: string | null,
): void {
  response.setHeader("Vary", "Origin");
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
  }
}

export function createHttpApplication(
  config: AppConfig,
  dependencies: HttpApplicationDependencies = {},
): HttpApplication {
  const logger = dependencies.logger ?? new Logger("http-transport");
  const client = dependencies.client ?? new NlaClient(config.nla);
  const createMcpServer =
    dependencies.createMcpServer ?? (() => createServer(config, { client }));
  const readinessCheck =
    dependencies.readinessCheck ??
    (async () => {
      // HEAD bypasses the shared GET cache so readiness always reaches NLA.
      await client.head("");
    });
  const now = dependencies.now ?? Date.now;
  const policy = new HttpRequestPolicy({
    allowedHosts: config.mcp.allowedHosts,
    allowedOrigins: config.mcp.allowedOrigins,
    trustProxy: config.mcp.trustProxy,
  });
  const rateLimiter = new HttpRateLimiter({
    windowMs: config.mcp.rateLimitWindowMs,
    perClientLimit: config.mcp.rateLimitPerClient,
    globalLimit: config.mcp.rateLimitGlobal,
    maxIdentities: config.mcp.rateLimitMaxIdentities,
    now,
  });
  const routeRateLimiter = new HttpRateLimiter({
    windowMs: config.mcp.rateLimitWindowMs,
    perClientLimit: Math.max(config.mcp.rateLimitPerClient * 4, 120),
    globalLimit: Math.max(config.mcp.rateLimitGlobal * 4, 1_200),
    maxIdentities: config.mcp.rateLimitMaxIdentities,
    now,
  });
  const concurrencyLimiter = new HttpConcurrencyLimiter({
    globalLimit: config.mcp.maxInFlight,
    perClientLimit: config.mcp.maxInFlightPerClient,
  });
  const activeCleanups = new Set<() => Promise<void>>();
  let readiness:
    | { expiresAt: number; ready: true }
    | { expiresAt: number; ready: false }
    | undefined;
  let readinessPending: Promise<boolean> | undefined;

  const checkReadiness = async (): Promise<boolean> => {
    const checkedAt = now();
    if (readiness && checkedAt < readiness.expiresAt) return readiness.ready;
    if (readinessPending) return readinessPending;
    readinessPending = readinessCheck()
      .then(() => true)
      .catch((error: unknown) => {
        logger.warn("readiness_check_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      })
      .then((ready) => {
        readiness = {
          expiresAt: now() + READINESS_CACHE_MS,
          ready,
        };
        return ready;
      })
      .finally(() => {
        readinessPending = undefined;
      });
    return readinessPending;
  };

  const handleMcp = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const clientId = policy.clientId(request);
    const rate = rateLimiter.check(clientId);
    response.setHeader("RateLimit-Limit", rate.limit);
    response.setHeader("RateLimit-Remaining", rate.remaining);
    if (!rate.allowed) {
      closeConnectionAfterResponse(request, response);
      response.setHeader("Retry-After", rate.retryAfterSeconds);
      response.setHeader("RateLimit-Reset", rate.retryAfterSeconds);
      logger.warn("rate_limit_exceeded", { scope: rate.scope });
      mcpError(response, 429, -32_000, "Rate limit exceeded");
      return;
    }
    const releaseConcurrency = concurrencyLimiter.acquire(clientId);
    if (!releaseConcurrency) {
      closeConnectionAfterResponse(request, response);
      response.setHeader("Retry-After", "1");
      logger.warn("concurrency_limit_exceeded", {
        ...concurrencyLimiter.snapshot(),
      });
      mcpError(response, 503, -32_000, "Server is busy");
      return;
    }

    try {
      let parsedBody: unknown;
      if (request.method === "POST") {
        if (!hasSupportedJsonMediaType(request)) {
          closeConnectionAfterResponse(request, response);
          mcpError(
            response,
            415,
            -32_000,
            "Content-Type must be application/json",
          );
          return;
        }
        try {
          parsedBody = await readJsonBody(
            request,
            config.mcp.maxRequestBytes,
            config.mcp.bodyTimeoutMs,
          );
        } catch (error) {
          if (error instanceof RequestBodyError) {
            logger.warn("request_body_rejected", { kind: error.kind });
            if (error.kind === "too-large") {
              closeConnectionAfterResponse(request, response);
              mcpError(response, 413, -32_000, error.message);
            } else if (error.kind === "unsupported-encoding") {
              closeConnectionAfterResponse(request, response);
              mcpError(response, 415, -32_000, error.message);
            } else if (error.kind === "timeout") {
              closeConnectionAfterResponse(request, response);
              mcpError(response, 408, -32_000, error.message);
            } else {
              mcpError(response, 400, -32_700, error.message);
            }
            return;
          }
          throw error;
        }
      }

      const mcpServer = createMcpServer();
      // Omitting sessionIdGenerator selects the SDK's stateless mode. A fresh
      // transport and MCP server are created for every request.
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      let closed = false;
      const cleanup = async (): Promise<void> => {
        if (closed) return;
        closed = true;
        activeCleanups.delete(cleanup);
        await mcpServer.close();
      };
      activeCleanups.add(cleanup);
      response.once("close", () => {
        void cleanup().catch((error: unknown) => {
          logger.warn("mcp_cleanup_failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });
      try {
        // SDK 1.29's optional callback declarations are not exact-optional clean,
        // although the Node transport implements the runtime Transport contract.
        await mcpServer.connect(
          transport as unknown as Parameters<McpServer["connect"]>[0],
        );
        await transport.handleRequest(request, response, parsedBody);
        if (response.writableEnded) await cleanup();
      } catch (error) {
        logger.error("mcp_request_failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!response.headersSent) {
          mcpError(response, 500, -32_603, "Internal server error");
        }
        await cleanup();
      }
    } finally {
      releaseConcurrency();
    }
  };

  const handler: RequestListener = (request, response) => {
    void (async () => {
      setSecurityHeaders(response);
      const routeRate = routeRateLimiter.check(policy.clientId(request));
      if (!routeRate.allowed) {
        closeConnectionAfterResponse(request, response);
        response.setHeader("Retry-After", routeRate.retryAfterSeconds);
        logger.warn("route_rate_limit_exceeded", { scope: routeRate.scope });
        jsonResponse(response, 429, { error: "Rate limit exceeded" });
        return;
      }
      if (!policy.isHostAllowed(request.headers.host)) {
        logger.warn("host_rejected");
        closeConnectionAfterResponse(request, response);
        jsonResponse(response, 403, { error: "Host is not allowed" });
        return;
      }
      const origin = request.headers.origin;
      if (!policy.isOriginAllowed(origin)) {
        logger.warn("origin_rejected");
        closeConnectionAfterResponse(request, response);
        jsonResponse(response, 403, { error: "Origin is not allowed" });
        return;
      }
      setCorsHeaders(response, policy.allowedOrigin(origin));

      const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
      const headOnly = request.method === "HEAD";
      if (pathname === HEALTH_PATH) {
        if (request.method !== "GET" && !headOnly) {
          response.setHeader("Allow", "GET, HEAD");
          jsonResponse(response, 405, { error: "Method not allowed" });
          return;
        }
        jsonResponse(
          response,
          200,
          { status: "ok", service: "armenian-national-library-mcp" },
          headOnly,
        );
        return;
      }
      if (pathname === READINESS_PATH) {
        if (request.method !== "GET" && !headOnly) {
          response.setHeader("Allow", "GET, HEAD");
          jsonResponse(response, 405, { error: "Method not allowed" });
          return;
        }
        const ready = await checkReadiness();
        jsonResponse(
          response,
          ready ? 200 : 503,
          {
            status: ready ? "ready" : "not_ready",
            upstream: ready ? "reachable" : "unavailable",
          },
          headOnly,
        );
        return;
      }
      if (pathname !== MCP_PATH) {
        jsonResponse(response, 404, { error: "Not found" });
        return;
      }
      if (request.method === "OPTIONS") {
        response.statusCode = 204;
        response.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE");
        response.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
        );
        response.setHeader("Access-Control-Max-Age", "600");
        response.end();
        return;
      }
      if (
        request.method !== "POST" &&
        request.method !== "GET" &&
        request.method !== "DELETE"
      ) {
        response.setHeader("Allow", "POST, GET, DELETE");
        mcpError(response, 405, -32_000, "Method not allowed");
        return;
      }
      if (
        config.mcp.authMode === "bearer" &&
        (!config.mcp.bearerToken ||
          !hasValidBearerToken(request, config.mcp.bearerToken))
      ) {
        closeConnectionAfterResponse(request, response);
        response.setHeader(
          "WWW-Authenticate",
          'Bearer realm="armenian-national-library-mcp"',
        );
        logger.warn("authentication_rejected");
        mcpError(response, 401, -32_000, "Authentication required");
        return;
      }
      await handleMcp(request, response);
    })().catch((error: unknown) => {
      logger.error("http_request_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        jsonResponse(response, 500, { error: "Internal server error" });
      } else {
        response.destroy();
      }
    });
  };

  return {
    handler,
    async close() {
      await Promise.all([...activeCleanups].map((cleanup) => cleanup()));
    },
  };
}

export async function startStreamableHttp(
  config: AppConfig,
  dependencies: HttpApplicationDependencies = {},
): Promise<StreamableHttpRuntime> {
  const application = createHttpApplication(config, dependencies);
  const server = createNodeServer(application.handler);
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
  server.maxConnections = config.mcp.maxInFlight * 2;
  server.maxRequestsPerSocket = 100;

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.mcp.port, config.mcp.host);
  });
  const address = server.address() as AddressInfo;
  let closed = false;
  return {
    server,
    host: config.mcp.host,
    port: address.port,
    mcpUrl: `http://${hostForUrl(config.mcp.host)}:${address.port}${MCP_PATH}`,
    async close() {
      if (closed) return;
      closed = true;
      const serverClosed = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
      await Promise.all([application.close(), serverClosed]);
    },
  };
}

function hostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}
