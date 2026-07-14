import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("configuration", () => {
  it("loads safe defaults", () => {
    const config = loadConfig({});
    expect(config.nla.apiBaseUrl).toBe("https://api.nla.am/server/api");
    expect(config.nla.allowedHost).toBe("api.nla.am");
    expect(config.mcp.transport).toBe("stdio");
    expect(config.nla.maxPageSize).toBe(50);
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
});
