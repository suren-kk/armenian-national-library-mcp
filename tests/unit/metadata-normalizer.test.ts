import { describe, expect, it } from "vitest";
import { normalizeDspaceObject } from "../../src/nla/metadata-normalizer.js";
import type { DspaceObject } from "../../src/nla/types.js";

describe("metadata normalization", () => {
  it("preserves multilingual repeated values and metadata attributes", () => {
    const object: DspaceObject = {
      id: "fdff35c4-2c16-481c-9bc8-fee00be21121",
      uuid: "fdff35c4-2c16-481c-9bc8-fee00be21121",
      type: "item",
      name: "Title\u001b[31m",
      handle: "123456789/10740",
      metadata: {
        "dc.title": [
          {
            value: "Վերնագիր",
            language: "hy",
            authority: null,
            confidence: 1,
            place: 0,
          },
          {
            value: "Title",
            language: "en",
            authority: "auth",
            confidence: 2,
            place: 1,
          },
        ],
        "dc.contributor.author": [
          {
            value: "Author",
            language: null,
            authority: null,
            confidence: -1,
            place: 0,
          },
        ],
      },
      inArchive: true,
      discoverable: true,
      withdrawn: false,
    };

    const result = normalizeDspaceObject(object);
    expect(result.normalized.title).toHaveLength(2);
    expect(result.normalized.title[0]).toMatchObject({
      value: "Վերնագիր",
      language: "hy",
      place: 0,
    });
    expect(result.normalized.title[1]?.authority).toBe("auth");
    expect(result.name).toBe("Title[31m");
    expect(result.normalized.canonicalUrl).toBe(
      "https://dspace.nla.am/handle/123456789/10740",
    );
  });
});
