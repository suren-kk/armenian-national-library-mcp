import { describe, expect, it } from "vitest";
import { hasExpectedFileSignature } from "../../src/security/content-limits.js";

describe("binary content signatures", () => {
  it("accepts known file signatures", () => {
    expect(
      hasExpectedFileSignature(
        new TextEncoder().encode("%PDF-1.7"),
        "application/pdf",
      ),
    ).toBe(true);
    expect(
      hasExpectedFileSignature(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "image/jpeg;charset=UTF-8",
      ),
    ).toBe(true);
  });

  it("rejects bytes that contradict a known declared MIME type", () => {
    expect(
      hasExpectedFileSignature(
        new TextEncoder().encode("not a pdf"),
        "application/pdf",
      ),
    ).toBe(false);
  });

  it("fails closed for unrecognized MIME types", () => {
    expect(
      hasExpectedFileSignature(
        new Uint8Array([1, 2, 3]),
        "application/octet-stream",
      ),
    ).toBe(false);
  });
});
