import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaRepository } from "../../src/nla/repository.js";
import { requestUrl, testConfig } from "../helpers.js";

describe("controlled raw API", () => {
  it("returns bounded JSON with upstream status and pagination", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            _embedded: { communities: [] },
            _links: { self: { href: url.toString() } },
            page: { number: 0, size: 50, totalElements: 0, totalPages: 0 },
          }),
          { headers: { "content-type": "application/hal+json" } },
        ),
      );
    });
    const repository = new NlaRepository(
      new NlaClient(testConfig().nla, fetchMock),
    );
    const result = await repository.rawApiGet({
      method: "GET",
      path: "/core/communities",
      query: { query: "Armenia" },
      page: 0,
      pageSize: 100,
      maxResponseBytes: 9_999_999,
    });

    expect(result.data).toMatchObject({
      method: "GET",
      status: 200,
      contentType: "application/hal+json",
      body: { _embedded: { communities: [] } },
    });
    expect(result.pagination).toMatchObject({ page: 0, pageSize: 50 });
    expect(result.warnings).toHaveLength(2);
    const requested = requestUrl(fetchMock.mock.calls[0]![0]);
    expect(requested.searchParams.get("size")).toBe("50");
    expect(requested.searchParams.get("query")).toBe("Armenia");
  });

  it("rejects non-text response bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "application/octet-stream" },
        }),
      ),
    );
    const repository = new NlaRepository(
      new NlaClient(testConfig().nla, fetchMock),
    );
    await expect(
      repository.rawApiGet({
        method: "GET",
        path: "/core/communities",
        query: {},
      }),
    ).rejects.toMatchObject({ code: "NLA_INVALID_RESPONSE" });
  });

  it("rejects JSON-like but non-JSON media types", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response("callback({})", {
          headers: { "content-type": "application/jsonp" },
        }),
      ),
    );
    const repository = new NlaRepository(
      new NlaClient(testConfig().nla, fetchMock),
    );
    await expect(
      repository.rawApiGet({
        method: "GET",
        path: "/core/communities",
        query: {},
      }),
    ).rejects.toMatchObject({ code: "NLA_INVALID_RESPONSE" });
  });
});
