import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getEmbedded,
  requireHalDocument,
  validatedLinks,
} from "../../src/nla/hal.js";
import { normalizeDspaceObject } from "../../src/nla/metadata-normalizer.js";
import { paginationFrom } from "../../src/nla/pagination.js";
import { NlaError } from "../../src/nla/errors.js";
import {
  parseAccessStatus,
  parseBitstream,
  parseBitstreamFormat,
  parseDspaceObject,
  parseSearchObject,
} from "../../src/nla/upstream-schemas.js";
import { UrlPolicy } from "../../src/security/url-policy.js";

const fixtures = JSON.parse(
  readFileSync(
    new URL("../fixtures/nla/contract-v1.json", import.meta.url),
    "utf8",
  ),
) as Record<string, unknown>;

function fixture<T = unknown>(name: string): T {
  const value = fixtures[name];
  if (value === undefined) throw new Error(`Missing fixture ${name}`);
  return value as T;
}

describe("versioned NLA contract fixtures", () => {
  it("validates the API root and its safe HAL links", () => {
    const root = requireHalDocument(fixture("apiRoot"));
    const links = validatedLinks(
      root,
      new UrlPolicy("https://api.nla.am/server/api", "api.nla.am"),
    );

    expect(Object.keys(links)).toEqual(["communities", "dso"]);
  });

  it.each([
    ["facets", "facets"],
    ["browse", "entries"],
    ["communityPage", "communities"],
    ["collectionPage", "collections"],
    ["bundlePage", "bundles"],
  ])("parses the paginated %s fixture", (fixtureName, relation) => {
    const document = requireHalDocument(fixture(fixtureName));

    expect(getEmbedded(document, relation)).not.toHaveLength(0);
    expect(paginationFrom(document)).toMatchObject({
      page: 0,
      totalPages: 1,
      hasNext: false,
    });
  });

  it("preserves safe unknown fields and complete metadata while normalizing", () => {
    const search = parseSearchObject(fixture("searchObject"));
    const parsed = search._embedded.indexableObject as Record<string, unknown>;
    const normalized = normalizeDspaceObject(search._embedded.indexableObject);

    expect(search.hitHighlights).toBeNull();
    expect(search).toMatchObject({
      nlaFixtureExtension: "preserved-search-field",
    });
    expect(parsed.nlaFixtureExtension).toEqual({
      catalogueCode: "preserved-object-field",
    });
    expect(normalized.metadata["nla.local.catalogue"]?.[0]).toMatchObject({
      value: "preserved-metadata-field",
      upstreamExtension: "preserved-value-field",
    });
    expect(normalized.normalized).toMatchObject({
      handle: "123456789/10740",
      rights: { status: "declared", reusable: null },
    });
  });

  it("parses community, collection, bundle, text, and original-file shapes", () => {
    for (const [fixtureName, relation, type] of [
      ["communityPage", "communities", "community"],
      ["collectionPage", "collections", "collection"],
      ["bundlePage", "bundles", "bundle"],
    ] as const) {
      const document = requireHalDocument(fixture(fixtureName));
      for (const value of getEmbedded(document, relation)) {
        expect(parseDspaceObject(value).type).toBe(type);
      }
    }

    expect(parseBitstream(fixture("textBitstream"))).toMatchObject({
      bundleName: "TEXT",
      sizeBytes: 83_043,
    });
    expect(parseBitstream(fixture("originalPdfBitstream"))).toMatchObject({
      bundleName: "ORIGINAL",
      name: "document.pdf",
    });
  });

  it("parses text/PDF formats and public/embargoed access declarations", () => {
    const formats = fixture<Record<string, unknown>>("formats");
    const statuses = fixture<Record<string, unknown>>("accessStatuses");

    expect(parseBitstreamFormat(formats.text).mimetype).toBe("text/plain");
    expect(parseBitstreamFormat(formats.pdf).mimetype).toBe("application/pdf");
    expect(parseAccessStatus(statuses.public)).toMatchObject({
      status: "open.access",
      embargoDate: null,
    });
    expect(parseAccessStatus(statuses.embargoed)).toMatchObject({
      status: "embargo.access",
      embargoDate: "2030-01-01T00:00:00Z",
    });
  });

  it("maps every reviewed HTTP failure fixture to a stable error code", () => {
    const failures =
      fixture<Array<{ status: number; code: string }>>("httpErrors");

    for (const { status, code } of failures) {
      expect(NlaError.fromStatus(status).code).toBe(code);
    }
  });
});
