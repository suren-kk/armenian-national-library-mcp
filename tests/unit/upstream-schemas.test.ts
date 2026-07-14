import { describe, expect, it } from "vitest";
import {
  parseAccessStatus,
  parseBitstream,
  parseBitstreamFormat,
  parseDspaceObject,
} from "../../src/nla/upstream-schemas.js";

describe("security-relevant upstream schemas", () => {
  it("rejects malformed metadata entries before normalization", () => {
    expect(() =>
      parseDspaceObject({
        uuid: "fdff35c4-2c16-481c-9bc8-fee00be21121",
        type: "item",
        metadata: {
          "dc.title": [
            {
              value: "title",
              language: null,
              authority: null,
              confidence: "trusted",
              place: 0,
            },
          ],
        },
      }),
    ).toThrow();
  });

  it("rejects negative bitstream sizes", () => {
    expect(() =>
      parseBitstream({
        uuid: "4ead233d-ef4d-4db6-b6f4-a5bb3783abf0",
        type: "bitstream",
        name: "document.txt",
        sizeBytes: -1,
      }),
    ).toThrow();
  });

  it("rejects incomplete format and access declarations", () => {
    expect(() =>
      parseBitstreamFormat({
        id: 1,
        type: "bitstreamformat",
        mimetype: "text/plain",
      }),
    ).toThrow();
    expect(() =>
      parseAccessStatus({ type: "accessStatus", status: "open.access" }),
    ).toThrow();
  });
});
