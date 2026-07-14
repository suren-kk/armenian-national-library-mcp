import {
  concreteEndpointPath,
  type EndpointRecord,
} from "../nla/endpoint-registry.js";
import { NlaError } from "../nla/errors.js";

const BITSTREAM_CONTENT = /^\/core\/bitstreams\/[^/]+\/content(?:\/|$)/i;

function decodeRepeatedly(value: string): string {
  let decoded = value;
  for (let index = 0; index < 5; index += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      throw NlaError.invalidResponse(
        "Raw API path contains malformed percent-encoding",
      );
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  throw NlaError.invalidResponse(
    "Raw API path uses excessive percent-encoding",
  );
}

export function assertRawApiPath(
  path: string,
  records: readonly EndpointRecord[],
): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\0") ||
    path.includes("://")
  ) {
    throw NlaError.invalidResponse(
      "Raw API path must be a plain API-relative path",
    );
  }
  const decoded = decodeRepeatedly(path);
  if (
    !decoded.startsWith("/") ||
    decoded.includes("\\") ||
    decoded.startsWith("//") ||
    decoded.includes("?") ||
    decoded.includes("#") ||
    decoded.includes("\0") ||
    decoded.includes("://") ||
    decoded.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw NlaError.invalidResponse(
      "Raw API path contains traversal or ambiguous separators",
    );
  }
  if (BITSTREAM_CONTENT.test(decoded)) {
    throw NlaError.invalidResponse(
      "Bitstream content is not available through nla_api_get; use get_bitstream or get_file_download",
    );
  }
  const allowed = records.some((record) => {
    if (!record.rawAllowed) return false;
    const registeredPath = concreteEndpointPath(record.path);
    if (registeredPath === "/") return decoded === "/";
    return (
      decoded === registeredPath || decoded.startsWith(`${registeredPath}/`)
    );
  });
  if (!allowed) {
    throw NlaError.invalidResponse(
      "Raw API path is not in the approved endpoint registry",
      {
        path,
      },
    );
  }
}
