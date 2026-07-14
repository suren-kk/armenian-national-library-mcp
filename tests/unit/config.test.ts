import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("configuration", () => {
  it("loads safe defaults", () => {
    const config = loadConfig({});
    expect(config.nla.apiBaseUrl).toBe("https://api.nla.am/server/api");
    expect(config.nla.allowedHost).toBe("api.nla.am");
    expect(config.mcp.transport).toBe("stdio");
    expect(config.nla.maxPageSize).toBe(50);
    expect(config.nla.cacheMaxEntries).toBe(128);
    expect(config.mcp.allowedHosts).toEqual(["127.0.0.1", "localhost"]);
    expect(config.mcp.allowedOrigins).toEqual([
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]);
    expect(config.mcp.maxRequestBytes).toBe(1_048_576);
    expect(config.mcp.trustProxy).toBe(false);
  });

  it("rejects a base URL outside the allowlisted host", () => {
    expect(() =>
      loadConfig({
        NLA_API_BASE_URL: "https://example.com/server/api",
        NLA_ALLOWED_HOST: "api.nla.am",
      }),
    ).toThrow(/must match/);
  });

  it("requires a download directory when writes are enabled", () => {
    expect(() => loadConfig({ NLA_ENABLE_FILE_WRITES: "true" })).toThrow(
      /NLA_DOWNLOAD_DIR/,
    );
  });

  it("normalizes explicit HTTP allowlists", () => {
    const config = loadConfig({
      MCP_TRANSPORT: "http",
      MCP_HOST: "0.0.0.0",
      MCP_ALLOWED_HOSTS: "archive.example:443, archive.example",
      MCP_ALLOWED_ORIGINS: "https://client.example/",
      MCP_TRUST_PROXY: "true",
    });
    expect(config.mcp.allowedHosts).toEqual(["archive.example"]);
    expect(config.mcp.allowedOrigins).toEqual(["https://client.example"]);
    expect(config.mcp.trustProxy).toBe(true);
  });

  it("rejects unsafe HTTP configuration", () => {
    expect(() =>
      loadConfig({ MCP_ALLOWED_HOSTS: "https://example.com/path" }),
    ).toThrow(/MCP_ALLOWED_HOSTS/);
    expect(() =>
      loadConfig({ MCP_ALLOWED_ORIGINS: "https://example.com/path" }),
    ).toThrow(/MCP_ALLOWED_ORIGINS/);
    expect(() =>
      loadConfig({
        MCP_RATE_LIMIT_PER_CLIENT: "100",
        MCP_RATE_LIMIT_GLOBAL: "10",
      }),
    ).toThrow(/MCP_RATE_LIMIT_GLOBAL/);
  });
});
