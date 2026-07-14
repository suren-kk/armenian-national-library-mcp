import { NlaError } from "../nla/errors.js";

/* eslint-disable no-control-regex -- filenames containing controls are rejected */
const UNSAFE_FILENAME = /[\\/\u0000-\u001f\u007f]/;
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
  const mime = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  switch (mime) {
    case "application/pdf":
      return (
        bytes.length >= 5 &&
        new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-"
      );
    case "image/png":
      return (
        bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
          (value, index) => bytes[index] === value,
        )
      );
    case "image/jpeg":
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case "image/gif": {
      const signature = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
      return (
        bytes.length >= 6 && (signature === "GIF87a" || signature === "GIF89a")
      );
    }
    default:
      return true;
  }
}
