import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import {
  NlaContentResolver,
  chunkUnicode,
  classifyBundle,
  decodeUtf8,
} from "../../src/nla/content-resolver.js";
import { requestUrl, testConfig } from "../helpers.js";

const itemUuid = "fdff35c4-2c16-481c-9bc8-fee00be21121";
const bundleUuid = "784dfd85-cc8a-4bc4-b130-4428a001dd0e";
const bitstreamUuid = "4ead233d-ef4d-4db6-b6f4-a5bb3783abf0";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/hal+json" },
  });
}

function fixtureFetch(text = "A😀ԲC\u001b[31m", bitstreamTotalPages = 1) {
  // Async keeps this test double assignable to the platform fetch signature.
  // eslint-disable-next-line @typescript-eslint/require-await
  return vi.fn<typeof fetch>(async (input) => {
    const url = requestUrl(input);
    if (url.pathname.endsWith(`/core/items/${itemUuid}/bundles`)) {
      return json({
        _embedded: {
          bundles: [{ uuid: bundleUuid, name: "TEXT", type: "bundle" }],
        },
        _links: { self: { href: url.toString() } },
        page: { number: 0, size: 50, totalElements: 1, totalPages: 1 },
      });
    }
    if (url.pathname.endsWith(`/core/bundles/${bundleUuid}/bitstreams`)) {
      return json({
        _embedded: {
          bitstreams: [
            {
              id: bitstreamUuid,
              uuid: bitstreamUuid,
              name: "document.pdf.txt",
              bundleName: "TEXT",
              sizeBytes: new TextEncoder().encode(text).byteLength,
              type: "bitstream",
              metadata: {},
              _links: {
                self: {
                  href: `${url.origin}/server/api/core/bitstreams/${bitstreamUuid}`,
                },
              },
            },
          ],
        },
        _links: { self: { href: url.toString() } },
        page: {
          number: 0,
          size: 50,
          totalElements: bitstreamTotalPages,
          totalPages: bitstreamTotalPages,
        },
      });
    }
    if (url.pathname.endsWith(`/core/bitstreams/${bitstreamUuid}/format`)) {
      return json({
        id: 6,
        shortDescription: "Text",
        description: "Plain text",
        mimetype: "text/plain",
        supportLevel: "KNOWN",
        internal: false,
        extensions: ["txt"],
        type: "bitstreamformat",
      });
    }
    if (
      url.pathname.endsWith(`/core/bitstreams/${bitstreamUuid}/accessStatus`)
    ) {
      return json({
        status: "open.access",
        embargoDate: null,
        type: "accessStatus",
      });
    }
    if (url.pathname.endsWith(`/core/bitstreams/${bitstreamUuid}/content`)) {
      return new Response(text, {
        headers: { "content-type": "text/plain;charset=UTF-8" },
      });
    }
    throw new Error(`Unexpected fixture URL: ${url.toString()}`);
  });
}

describe("content resolution", () => {
  it.each([
    ["original", "ORIGINAL"],
    ["TEXT", "TEXT"],
    ["Thumbnail", "THUMBNAIL"],
    ["LICENSE", "LICENSE"],
    ["CUSTOM", "OTHER"],
  ] as const)("classifies %s as %s", (input, expected) => {
    expect(classifyBundle(input)).toBe(expected);
  });

  it("chunks by Unicode code points without splitting surrogate pairs", () => {
    expect(chunkUnicode("A😀ԲC", 1, 2)).toEqual({
      text: "😀Բ",
      totalChars: 4,
      nextOffset: 3,
    });
  });

  it("rejects malformed UTF-8 instead of inserting replacement characters", () => {
    expect(() => decodeUtf8(new Uint8Array([0xc3, 0x28]))).toThrowError(
      expect.objectContaining({ code: "NLA_INVALID_RESPONSE" }),
    );
  });

  it("selects NLA TEXT content, sanitizes controls, and returns continuation metadata", async () => {
    const fetchMock = fixtureFetch();
    const resolver = new NlaContentResolver(
      new NlaClient(testConfig().nla, fetchMock),
    );
    const result = await resolver.getItemText({
      itemUuid,
      offsetChars: 1,
      maxChars: 2,
    });

    expect(result.data).toMatchObject({
      bitstreamUuid,
      text: "😀Բ",
      offsetChars: 1,
      returnedChars: 2,
      nextOffset: 3,
      provenance: {
        kind: "nla-provided-extracted-text",
        derivedLocally: false,
        untrustedSourceData: true,
      },
      resourceLink: {
        type: "resource_link",
        uri: `nla://bitstream/${bitstreamUuid}/content`,
      },
    });
    expect(result.truncated).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("rejects a requested bitstream that is not in the item TEXT bundle", async () => {
    const resolver = new NlaContentResolver(
      new NlaClient(testConfig().nla, fixtureFetch()),
    );
    await expect(
      resolver.getItemText({
        itemUuid,
        bitstreamUuid: "c81247ed-05ac-47e1-8eef-b7b0290d73ec",
        offsetChars: 0,
        maxChars: 10,
      }),
    ).rejects.toMatchObject({ code: "NLA_NOT_FOUND" });
  });

  it("reports when a bundle's bitstream list is truncated", async () => {
    const resolver = new NlaContentResolver(
      new NlaClient(testConfig().nla, fixtureFetch("text", 2)),
    );
    const result = await resolver.listItemFiles(itemUuid);

    expect(result.truncated).toBe(true);
    expect(result.data[0]?.filesTruncated).toBe(true);
    expect(result.warnings).toContain("Bitstreams in bundle TEXT were capped");
  });

  it("rejects oversized binary resources before downloading content", async () => {
    const pdfUuid = "c81247ed-05ac-47e1-8eef-b7b0290d73ec";
    // Async keeps this test double assignable to the platform fetch signature.
    // eslint-disable-next-line @typescript-eslint/require-await
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      const base = `/core/bitstreams/${pdfUuid}`;
      if (url.pathname.endsWith(base)) {
        return json({
          id: pdfUuid,
          uuid: pdfUuid,
          name: "original.pdf",
          bundleName: "ORIGINAL",
          sizeBytes: 3_506_878,
          type: "bitstream",
          metadata: {},
          _links: { self: { href: url.toString() } },
        });
      }
      if (url.pathname.endsWith(`${base}/format`)) {
        return json({
          id: 4,
          shortDescription: "Adobe PDF",
          description: "Adobe Portable Document Format",
          mimetype: "application/pdf",
          supportLevel: "KNOWN",
          internal: false,
          extensions: ["pdf"],
          type: "bitstreamformat",
        });
      }
      if (url.pathname.endsWith(`${base}/accessStatus`)) {
        return json({
          status: "open.access",
          embargoDate: null,
          type: "accessStatus",
        });
      }
      throw new Error(
        "Binary content must not be fetched when metadata exceeds the inline limit",
      );
    });
    const resolver = new NlaContentResolver(
      new NlaClient(testConfig().nla, fetchMock),
    );

    await expect(resolver.readBitstreamContent(pdfUuid)).rejects.toMatchObject({
      code: "NLA_RESPONSE_TOO_LARGE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
