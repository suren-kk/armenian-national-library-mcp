import { describe, expect, it } from "vitest";
import {
  getEmbedded,
  requireHalDocument,
  validatedLinks,
} from "../../src/nla/hal.js";
import { paginationFrom } from "../../src/nla/pagination.js";
import { UrlPolicy } from "../../src/security/url-policy.js";

describe("HAL and pagination", () => {
  const policy = new UrlPolicy("https://api.nla.am/server/api", "api.nla.am");

  it("extracts embedded records and pagination", () => {
    const document = requireHalDocument({
      _embedded: { items: [{ id: "one" }] },
      _links: { self: { href: "https://api.nla.am/server/api/core/items" } },
      page: { number: 0, size: 1, totalElements: 2, totalPages: 2 },
    });
    expect(getEmbedded(document, "items")).toEqual([{ id: "one" }]);
    expect(paginationFrom(document)).toEqual({
      page: 0,
      pageSize: 1,
      totalElements: 2,
      totalPages: 2,
      hasNext: true,
    });
    expect(validatedLinks(document, policy).self).toBeDefined();
  });

  it("rejects malformed embedded data and external HAL links", () => {
    const malformed = requireHalDocument({ _embedded: { items: {} } });
    expect(() => getEmbedded(malformed, "items")).toThrow(/not an array/);
    expect(() =>
      validatedLinks(
        requireHalDocument({
          _links: { self: { href: "https://attacker.example/data" } },
        }),
        policy,
      ),
    ).toThrow();
  });

  it.each([
    { number: 0.5, size: 10, totalElements: 1, totalPages: 1 },
    {
      number: 0,
      size: Number.MAX_SAFE_INTEGER + 1,
      totalElements: 0,
      totalPages: 0,
    },
    { number: 1, size: 10, totalElements: 1, totalPages: 1 },
    { number: 0, size: 10, totalElements: 1, totalPages: 0 },
  ])("rejects invalid page metadata %#", (page) => {
    expect(() => paginationFrom(requireHalDocument({ page }))).toThrow();
  });
});
