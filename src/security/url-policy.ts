import { NlaError } from "../nla/errors.js";

const ENCODED_TRAVERSAL = /%(?:2e|5c)/i;

export class UrlPolicy {
  readonly baseUrl: URL;

  constructor(
    baseUrl: string,
    private readonly allowedHost: string,
  ) {
    this.baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.assertAllowed(this.baseUrl);
  }

  resolve(pathOrUrl: string): URL {
    if (
      pathOrUrl.startsWith("//") ||
      pathOrUrl.includes("\\") ||
      ENCODED_TRAVERSAL.test(pathOrUrl)
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
