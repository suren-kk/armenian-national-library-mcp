import { z } from "zod";
import {
  normalizeHostAuthority,
  normalizeOrigin,
} from "./security/http-request-policy.js";
import { NLA_API_HOST } from "./security/url-policy.js";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const optionalSecret = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().min(32).optional(),
);

function commaSeparated(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function defaultAllowedHosts(host: string): string[] {
  if (host === "127.0.0.1") return ["127.0.0.1", "localhost"];
  if (host === "::1") return ["[::1]", "localhost"];
  return [host];
}

function hostForOrigin(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

function normalizedValues(
  values: readonly string[],
  normalize: (value: string) => string | null,
): string[] | null {
  const normalized = values.map(normalize);
  if (normalized.some((value) => value === null)) return null;
  return [...new Set(normalized.filter((value) => value !== null))];
}

export const configSchema = z
  .object({
    NLA_API_BASE_URL: z.url().default("https://api.nla.am/server/api"),
    NLA_ALLOWED_HOST: z.literal(NLA_API_HOST).default(NLA_API_HOST),
    NLA_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    NLA_MAX_PAGE_SIZE: z.coerce.number().int().min(1).max(200).default(50),
    NLA_MAX_METADATA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2_097_152),
    NLA_MAX_TEXT_CHARS: z.coerce.number().int().positive().default(50_000),
    NLA_MAX_INLINE_BINARY_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(2_097_152),
    NLA_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(6),
    NLA_MAX_REDIRECTS: z.coerce.number().int().min(0).max(10).default(3),
    NLA_MAX_RETRIES: z.coerce.number().int().min(0).max(8).default(3),
    NLA_CACHE_ENABLED: booleanFromString.default(true),
    NLA_CACHE_TTL_MS: z.coerce.number().int().min(0).default(30_000),
    NLA_CACHE_MAX_ENTRIES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(128),
    NLA_CACHE_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(134_217_728)
      .default(16_777_216),
    MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    MCP_HOST: z.string().min(1).default("127.0.0.1"),
    MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    MCP_ALLOWED_HOSTS: z.string().optional(),
    MCP_ALLOWED_ORIGINS: z.string().optional(),
    MCP_AUTH_MODE: z
      .enum(["local", "bearer", "trusted-proxy"])
      .default("local"),
    MCP_BEARER_TOKEN: optionalSecret,
    MCP_MAX_REQUEST_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(16_777_216)
      .default(1_048_576),
    MCP_BODY_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60_000)
      .default(10_000),
    MCP_MAX_IN_FLIGHT: z.coerce.number().int().min(1).max(256).default(32),
    MCP_MAX_IN_FLIGHT_PER_CLIENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(64)
      .default(4),
    MCP_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .default(60_000),
    MCP_RATE_LIMIT_PER_CLIENT: z.coerce
      .number()
      .int()
      .min(1)
      .max(100_000)
      .default(60),
    MCP_RATE_LIMIT_GLOBAL: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(600),
    MCP_RATE_LIMIT_MAX_IDENTITIES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(2_048),
    MCP_TRUST_PROXY: booleanFromString.default(false),
  })
  .transform((env) => {
    const apiBaseUrl = new URL(env.NLA_API_BASE_URL);
    if (apiBaseUrl.protocol !== "https:") {
      throw new Error("NLA_API_BASE_URL must use HTTPS");
    }
    if (apiBaseUrl.hostname !== env.NLA_ALLOWED_HOST) {
      throw new Error("NLA_API_BASE_URL host must match NLA_ALLOWED_HOST");
    }
    if (env.MCP_RATE_LIMIT_GLOBAL < env.MCP_RATE_LIMIT_PER_CLIENT) {
      throw new Error(
        "MCP_RATE_LIMIT_GLOBAL must be at least MCP_RATE_LIMIT_PER_CLIENT",
      );
    }
    if (env.MCP_MAX_IN_FLIGHT < env.MCP_MAX_IN_FLIGHT_PER_CLIENT) {
      throw new Error(
        "MCP_MAX_IN_FLIGHT must be at least MCP_MAX_IN_FLIGHT_PER_CLIENT",
      );
    }
    const configuredHosts =
      env.MCP_ALLOWED_HOSTS === undefined
        ? defaultAllowedHosts(env.MCP_HOST)
        : commaSeparated(env.MCP_ALLOWED_HOSTS);
    const allowedHosts = normalizedValues(
      configuredHosts,
      normalizeHostAuthority,
    );
    if (allowedHosts === null || allowedHosts.length === 0) {
      throw new Error("MCP_ALLOWED_HOSTS must contain valid host authorities");
    }
    const configuredOrigins =
      env.MCP_ALLOWED_ORIGINS === undefined
        ? allowedHosts.map(
            (host) => `http://${hostForOrigin(host)}:${env.MCP_PORT}`,
          )
        : commaSeparated(env.MCP_ALLOWED_ORIGINS);
    const allowedOrigins = normalizedValues(configuredOrigins, normalizeOrigin);
    if (allowedOrigins === null || allowedOrigins.length === 0) {
      throw new Error("MCP_ALLOWED_ORIGINS must contain valid HTTP(S) origins");
    }
    const localAuthorities = new Set([
      "127.0.0.1",
      "::1",
      "[::1]",
      "localhost",
    ]);
    if (
      env.MCP_AUTH_MODE === "local" &&
      allowedHosts.some((host) => !localAuthorities.has(host))
    ) {
      throw new Error(
        "MCP_AUTH_MODE=local permits only loopback MCP_ALLOWED_HOSTS",
      );
    }
    if (env.MCP_AUTH_MODE === "bearer" && !env.MCP_BEARER_TOKEN) {
      throw new Error("MCP_BEARER_TOKEN is required for bearer authentication");
    }

    return {
      nla: {
        apiBaseUrl: apiBaseUrl.toString().replace(/\/$/, ""),
        allowedHost: env.NLA_ALLOWED_HOST,
        httpTimeoutMs: env.NLA_HTTP_TIMEOUT_MS,
        maxPageSize: env.NLA_MAX_PAGE_SIZE,
        maxMetadataBytes: env.NLA_MAX_METADATA_BYTES,
        maxTextChars: env.NLA_MAX_TEXT_CHARS,
        maxInlineBinaryBytes: env.NLA_MAX_INLINE_BINARY_BYTES,
        maxConcurrency: env.NLA_MAX_CONCURRENCY,
        maxRedirects: env.NLA_MAX_REDIRECTS,
        maxRetries: env.NLA_MAX_RETRIES,
        cacheEnabled: env.NLA_CACHE_ENABLED,
        cacheTtlMs: env.NLA_CACHE_TTL_MS,
        cacheMaxEntries: env.NLA_CACHE_MAX_ENTRIES,
        cacheMaxBytes: env.NLA_CACHE_MAX_BYTES,
      },
      mcp: {
        transport: env.MCP_TRANSPORT,
        host: env.MCP_HOST,
        port: env.MCP_PORT,
        allowedHosts,
        allowedOrigins,
        authMode: env.MCP_AUTH_MODE,
        bearerToken: env.MCP_BEARER_TOKEN,
        maxRequestBytes: env.MCP_MAX_REQUEST_BYTES,
        bodyTimeoutMs: env.MCP_BODY_TIMEOUT_MS,
        maxInFlight: env.MCP_MAX_IN_FLIGHT,
        maxInFlightPerClient: env.MCP_MAX_IN_FLIGHT_PER_CLIENT,
        rateLimitWindowMs: env.MCP_RATE_LIMIT_WINDOW_MS,
        rateLimitPerClient: env.MCP_RATE_LIMIT_PER_CLIENT,
        rateLimitGlobal: env.MCP_RATE_LIMIT_GLOBAL,
        rateLimitMaxIdentities: env.MCP_RATE_LIMIT_MAX_IDENTITIES,
        trustProxy: env.MCP_TRUST_PROXY,
      },
    };
  });

export type AppConfig = z.output<typeof configSchema>;
export type NlaConfig = AppConfig["nla"];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
