import { loadConfig } from "../src/config.js";

export function testConfig(overrides: NodeJS.ProcessEnv = {}) {
  return loadConfig({
    NLA_API_BASE_URL: "https://api.nla.am/server/api",
    NLA_ALLOWED_HOST: "api.nla.am",
    NLA_HTTP_TIMEOUT_MS: "1000",
    NLA_MAX_RETRIES: "1",
    NLA_CACHE_ENABLED: "false",
    ...overrides,
  });
}

export function requestUrl(input: string | URL | Request): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}
