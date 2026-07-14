import { afterEach, describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { Logger } from "../../src/observability/logger.js";
import { testConfig } from "../helpers.js";

describe("security logging", () => {
  afterEach(() => vi.restoreAllMocks());

  it("redacts sensitive fields recursively", () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    new Logger("security-test").info("request", {
      authorization: "Bearer top-secret",
      request: {
        headers: {
          cookie: "session=secret",
          nested: [{ accessToken: "token-value", safe: "visible" }],
        },
      },
      documentText: "private content",
    });
    const line = String(write.mock.calls[0]?.[0]);
    const record = JSON.parse(line) as Record<string, unknown>;

    expect(record).toMatchObject({
      authorization: "[REDACTED]",
      documentText: "[REDACTED]",
      request: {
        headers: {
          cookie: "[REDACTED]",
          nested: [{ accessToken: "[REDACTED]", safe: "visible" }],
        },
      },
    });
    expect(line).not.toContain("top-secret");
    expect(line).not.toContain("token-value");
    expect(line).not.toContain("private content");
  });

  it("omits query parameters from upstream request logs", async () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ type: "search", _links: {} }), {
        headers: { "content-type": "application/hal+json" },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);

    await client.getJson("discover/search/objects", {
      query: { query: "private search terms" },
    });

    const output = write.mock.calls.map(([line]) => String(line)).join("");
    expect(output).toContain(
      "https://api.nla.am/server/api/discover/search/objects",
    );
    expect(output).not.toContain("private search terms");
    expect(output).not.toContain("private+search+terms");
  });

  it("does not log rejected redirect targets", async () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://example.com/collect?token=redirect-secret",
        },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);

    await expect(client.getJson("core/sites")).rejects.toMatchObject({
      code: "NLA_INVALID_RESPONSE",
    });

    const output = write.mock.calls.map(([line]) => String(line)).join("");
    expect(output).toContain('"url":"[REJECTED]"');
    expect(output).not.toContain("example.com");
    expect(output).not.toContain("redirect-secret");
  });
});
