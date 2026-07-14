import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

function withoutTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

export function normalizeHostAuthority(value: string): string | null {
  if (
    value.trim() !== value ||
    value === "" ||
    value.includes(",") ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    return null;
  }
  try {
    const url = new URL(`http://${value}`);
    if (
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return withoutTrailingDot(url.hostname.toLowerCase());
  } catch {
    return null;
  }
}

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export interface HttpRequestPolicyOptions {
  allowedHosts: readonly string[];
  allowedOrigins: readonly string[];
  trustProxy: boolean;
}

export class HttpRequestPolicy {
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(private readonly options: HttpRequestPolicyOptions) {
    this.allowedHosts = new Set(
      options.allowedHosts.map((host) => {
        const normalized = normalizeHostAuthority(host);
        if (!normalized) throw new Error(`Invalid allowed host: ${host}`);
        return normalized;
      }),
    );
    this.allowedOrigins = new Set(
      options.allowedOrigins.map((origin) => {
        const normalized = normalizeOrigin(origin);
        if (!normalized) throw new Error(`Invalid allowed origin: ${origin}`);
        return normalized;
      }),
    );
  }

  isHostAllowed(hostHeader: string | undefined): boolean {
    if (!hostHeader) return false;
    const normalized = normalizeHostAuthority(hostHeader);
    return normalized !== null && this.allowedHosts.has(normalized);
  }

  allowedOrigin(originHeader: string | undefined): string | null {
    if (!originHeader) return null;
    const normalized = normalizeOrigin(originHeader);
    return normalized && this.allowedOrigins.has(normalized)
      ? normalized
      : null;
  }

  isOriginAllowed(originHeader: string | undefined): boolean {
    return !originHeader || this.allowedOrigin(originHeader) !== null;
  }

  clientId(request: IncomingMessage): string {
    if (this.options.trustProxy) {
      const forwarded = request.headers["x-forwarded-for"];
      const first = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded?.split(",", 1)[0];
      const candidate = first?.trim();
      if (candidate && isIP(candidate) !== 0) return candidate;
    }
    return request.socket.remoteAddress ?? "unknown";
  }
}
