import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaError } from "../../src/nla/errors.js";
import { requestUrl, testConfig } from "../helpers.js";

describe("NLA HTTP client", () => {
  it("retries retryable responses and then parses JSON", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "root", _links: {} }), {
          headers: { "content-type": "application/hal+json" },
        }),
      );
    const client = new NlaClient(testConfig().nla, fetchMock);
    const result = await client.getJson<{ type: string }>("");
    expect(result.data.type).toBe("root");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a fresh cache entry without another request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ answer: 42 }), {
        headers: { "content-type": "application/json", etag: '"one"' },
      }),
    );
    const client = new NlaClient(
      testConfig({ NLA_CACHE_ENABLED: "true", NLA_CACHE_TTL_MS: "60000" }).nla,
      fetchMock,
    );
    await client.getJson("core/sites");
    const cached = await client.getJson("core/sites");
    expect(cached.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used responses when the cache reaches its bound", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) =>
      Promise.resolve(
        new Response(JSON.stringify({ url: requestUrl(input).toString() }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NlaClient(
      testConfig({
        NLA_CACHE_ENABLED: "true",
        NLA_CACHE_TTL_MS: "60000",
        NLA_CACHE_MAX_ENTRIES: "1",
      }).nla,
      fetchMock,
    );

    await client.getJson("core/sites");
    await client.getJson("core/communities");
    await client.getJson("core/sites");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps non-retryable HTTP errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = new NlaClient(testConfig().nla, fetchMock);
    await expect(client.getJson("core/items/private")).rejects.toMatchObject({
      code: "NLA_AUTHENTICATION_REQUIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces response size while streaming", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ value: "too large" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);
    await expect(
      client.getJson("core/sites", { maxResponseBytes: 4 }),
    ).rejects.toBeInstanceOf(NlaError);
  });
});
