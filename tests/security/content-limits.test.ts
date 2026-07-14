import { describe, expect, it } from "vitest";
import {
  assertSafeFilename,
  hasExpectedFileSignature,
  isInlineMimeTypeAllowed,
  readResponseBytes,
} from "../../src/security/content-limits.js";

describe("content safety boundaries", () => {
  it.each([
    "../document.pdf",
    "folder/document.pdf",
    "folder\\document.pdf",
    ".",
    "..",
    " document.pdf",
    "document.pdf ",
    "document.pdf\u0000.exe",
    "document.pdf\n.exe",
    "document\u202egnp.exe",
    "document\u200b.pdf",
    "document\u00ad.pdf",
  ])("rejects a suspicious filename %j", (filename) => {
    expect(() => assertSafeFilename(filename)).toThrow();
  });

  it.each(["document.pdf", "Հայերեն գիրք.txt", "scan (final) [1].jpg"])(
    "accepts a display-only basename %j",
    (filename) => {
      expect(() => assertSafeFilename(filename)).not.toThrow();
    },
  );

  it("rejects a declared response that exceeds the byte cap", async () => {
    const response = new Response("small", {
      headers: { "content-length": "1025" },
    });
    await expect(readResponseBytes(response, 1024)).rejects.toMatchObject({
      code: "NLA_RESPONSE_TOO_LARGE",
    });
  });

  it("enforces the cap when Content-Length is absent", async () => {
    const response = new Response(new Uint8Array(1025));
    await expect(readResponseBytes(response, 1024)).rejects.toMatchObject({
      code: "NLA_RESPONSE_TOO_LARGE",
    });
  });

  it("enforces the cap when Content-Length understates the body", async () => {
    const response = new Response(new Uint8Array(1025), {
      headers: { "content-length": "10" },
    });
    await expect(readResponseBytes(response, 1024)).rejects.toMatchObject({
      code: "NLA_RESPONSE_TOO_LARGE",
    });
  });

  it.each([
    ["application/pdf", "%PDF-1.7"],
    ["image/png", "not a PNG"],
    ["image/jpeg", "not a JPEG"],
    ["image/gif", "not a GIF"],
  ])("checks the signature for %s", (mimeType, value) => {
    const matches = hasExpectedFileSignature(
      new TextEncoder().encode(value),
      mimeType,
    );
    expect(matches).toBe(mimeType === "application/pdf");
  });

  it.each(["text/plain", "image/png", "image/jpeg", "image/gif"])(
    "allows reviewed inline type %s",
    (mimeType) => expect(isInlineMimeTypeAllowed(mimeType)).toBe(true),
  );

  it.each([
    "text/html",
    "image/svg+xml",
    "application/javascript",
    "application/pdf",
    "application/octet-stream",
    "application/xml",
  ])("denies active, complex, or unknown inline type %s", (mimeType) => {
    expect(isInlineMimeTypeAllowed(mimeType)).toBe(false);
  });
});
