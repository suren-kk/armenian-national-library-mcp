import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const optionalDirectory = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string())
  .optional();

export const configSchema = z
  .object({
    NLA_API_BASE_URL: z.url().default("https://api.nla.am/server/api"),
    NLA_ALLOWED_HOST: z.string().min(1).default("api.nla.am"),
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
    NLA_ENABLE_FILE_WRITES: booleanFromString.default(false),
    NLA_DOWNLOAD_DIR: optionalDirectory,
    MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
    MCP_HOST: z.string().min(1).default("127.0.0.1"),
    MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  })
  .transform((env) => {
    const apiBaseUrl = new URL(env.NLA_API_BASE_URL);
    if (apiBaseUrl.protocol !== "https:") {
      throw new Error("NLA_API_BASE_URL must use HTTPS");
    }
    if (apiBaseUrl.hostname !== env.NLA_ALLOWED_HOST) {
      throw new Error("NLA_API_BASE_URL host must match NLA_ALLOWED_HOST");
    }
    if (env.NLA_ENABLE_FILE_WRITES && !env.NLA_DOWNLOAD_DIR) {
      throw new Error(
        "NLA_DOWNLOAD_DIR is required when file writes are enabled",
      );
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
        enableFileWrites: env.NLA_ENABLE_FILE_WRITES,
        downloadDir: env.NLA_DOWNLOAD_DIR,
      },
      mcp: {
        transport: env.MCP_TRANSPORT,
        host: env.MCP_HOST,
        port: env.MCP_PORT,
      },
    };
  });

export type AppConfig = z.output<typeof configSchema>;
export type NlaConfig = AppConfig["nla"];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return configSchema.parse(env);
}
