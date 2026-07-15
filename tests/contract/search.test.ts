import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaRepository } from "../../src/nla/repository.js";
import { testConfig } from "../helpers.js";

const item = {
  id: "fdff35c4-2c16-481c-9bc8-fee00be21121",
  uuid: "fdff35c4-2c16-481c-9bc8-fee00be21121",
  name: "America as mandatary for Armenia",
  handle: "123456789/10740",
  type: "item",
  metadata: {
    "dc.title": [
      {
        value: "America as mandatary for Armenia",
        language: "en",
        authority: null,
        confidence: -1,
        place: 0,
      },
    ],
  },
  _links: {
    self: {
      href: "https://api.nla.am/server/api/core/items/fdff35c4-2c16-481c-9bc8-fee00be21121",
    },
  },
};

describe("search contract", () => {
  it("unwraps DSpace Discover results, highlights, facets, and pagination", async () => {
    const fixture = {
      type: "discover",
      _links: {
        self: { href: "https://api.nla.am/server/api/discover/search/objects" },
      },
      _embedded: {
        searchResult: {
          _embedded: {
            objects: [
              {
                hitHighlights: {
                  "dc.title": ["America as mandatary for <em>Armenia</em>"],
                },
                _embedded: { indexableObject: item },
              },
            ],
          },
          page: { number: 0, size: 1, totalElements: 1, totalPages: 1 },
        },
        facets: [{ name: "author" }],
      },
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        headers: { "content-type": "application/hal+json" },
      }),
    );
    const repository = new NlaRepository(
      new NlaClient(testConfig().nla, fetchMock),
    );
    const result = await repository.search({
      query: "Armenia",
      dso_type: "item",
      page: 0,
      page_size: 10,
      filters: [
        { field: "author", value: "One", operator: "equals" },
        { field: "author", value: "Two", operator: "contains" },
        { field: "subject", value: "History", operator: "equals" },
      ],
      include_metadata: true,
    });

    expect(result.pagination?.totalElements).toBe(1);
    expect(result.warnings).toEqual([
      expect.stringContaining("Public access does not grant permission"),
    ]);
    expect(result.truncated).toBe(false);
    expect(result.data).toMatchObject({
      results: [
        {
          normalized: { handle: "123456789/10740" },
          highlights: {
            "dc.title": ["America as mandatary for <em>Armenia</em>"],
          },
        },
      ],
      facets: [{ name: "author" }],
    });
    const requestInput = fetchMock.mock.calls[0]?.[0];
    expect(requestInput).toBeDefined();
    const requested = new URL(
      typeof requestInput === "string"
        ? requestInput
        : requestInput instanceof URL
          ? requestInput.href
          : requestInput!.url,
    );
    expect(requested.searchParams.getAll("f.author")).toEqual([
      "One,equals",
      "Two,contains",
    ]);
    expect(requested.searchParams.getAll("f.subject")).toEqual([
      "History,equals",
    ]);
  });
});
