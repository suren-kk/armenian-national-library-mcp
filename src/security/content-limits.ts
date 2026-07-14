import { NlaError } from "../nla/errors.js";

/* eslint-disable no-control-regex -- filenames containing controls are rejected */
const UNSAFE_FILENAME = /[\\/\u0000-\u001f\u007f]|\p{Cf}/u;
/* eslint-enable no-control-regex */

export function assertSafeFilename(filename: string): void {
  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    filename.trim() !== filename ||
    UNSAFE_FILENAME.test(filename)
  ) {
    throw NlaError.invalidResponse("NLA returned an unsafe filename");
  }
}

export async function readResponseBytes(
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maximumBytes) {
    throw NlaError.responseTooLarge(maximumBytes, Number(declaredLength));
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        await reader.cancel();
        throw NlaError.responseTooLarge(maximumBytes, bytesRead);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const result = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function hasExpectedFileSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  const mime = normalizeMimeType(mimeType);
  return detectFileMimeType(bytes) === mime;
}

export function normalizeMimeType(mimeType: string): string {
  return (mimeType.split(";", 1)[0] ?? "").trim().toLowerCase();
}

export function isInlineMimeTypeAllowed(mimeType: string): boolean {
  return ["text/plain", "image/png", "image/jpeg", "image/gif"].includes(
    normalizeMimeType(mimeType),
  );
}

export function detectFileMimeType(bytes: Uint8Array): string | null {
  const ascii = new TextDecoder("ascii");
  if (bytes.length >= 5 && ascii.decode(bytes.subarray(0, 5)) === "%PDF-") {
    return "application/pdf";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  const gif = ascii.decode(bytes.subarray(0, 6));
  if (bytes.length >= 6 && (gif === "GIF87a" || gif === "GIF89a")) {
    return "image/gif";
  }
  return null;
}
