import { NlaError } from "../nla/errors.js";

const ENCODED_UNSAFE_PATH = /%(?:00|23|25|2e|2f|3f|5c)/i;
const DOT_PATH_SEGMENT = /(?:^|\/)\.{1,2}(?:\/|$)/;
export const NLA_API_HOST = "api.nla.am";

export class UrlPolicy {
  readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly allowedHost: string,
  ) {
    if (allowedHost !== NLA_API_HOST) {
      throw NlaError.invalidResponse(
        `The upstream host is fixed to ${NLA_API_HOST}`,
      );
    }
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.assertAllowed(this.baseUrl);
  }

  resolve(pathOrUrl: string): URL {
    const pathOnly = pathOrUrl.split(/[?#]/, 1)[0] ?? pathOrUrl;
    if (
      pathOrUrl.startsWith("//") ||
      pathOrUrl.includes("\\") ||
      DOT_PATH_SEGMENT.test(pathOnly) ||
      ENCODED_UNSAFE_PATH.test(pathOnly)
    ) {
      throw NlaError.invalidResponse("Rejected unsafe upstream path");
    }
    const url =
      pathOrUrl === ""
        ? new URL(this.baseUrl.toString().replace(/\/$/, ""))
        : new URL(pathOrUrl.replace(/^\//, ""), this.baseUrl);
    this.assertAllowed(url);
    return url;
  }

  assertAllowed(url: URL): void {
    if (ENCODED_UNSAFE_PATH.test(url.pathname)) {
      throw NlaError.invalidResponse(
        "Upstream URL contains unsafe path encoding",
      );
    }

    if (
      url.protocol !== "https:" ||
      url.hostname !== this.allowedHost ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== ""
    ) {
      throw NlaError.invalidResponse(
        "Upstream URL violates the NLA same-origin policy",
        {
          host: url.hostname,
          protocol: url.protocol,
        },
      );
    }

    const basePath =
      this.baseUrl?.pathname.replace(/\/$/, "") ??
      url.pathname.replace(/\/$/, "");
    if (
      this.baseUrl &&
      url.pathname !== basePath &&
      !url.pathname.startsWith(`${basePath}/`)
    ) {
      throw NlaError.invalidResponse(
        "Upstream URL is outside the configured API base path",
      );
    }
  }
}
