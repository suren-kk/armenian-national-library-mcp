export type NlaErrorCode =
  | "NLA_NOT_FOUND"
  | "NLA_AUTHENTICATION_REQUIRED"
  | "NLA_ACCESS_RESTRICTED"
  | "NLA_RATE_LIMITED"
  | "NLA_UPSTREAM_TIMEOUT"
  | "NLA_UPSTREAM_UNAVAILABLE"
  | "NLA_RESPONSE_TOO_LARGE"
  | "NLA_INVALID_RESPONSE";

const GUIDANCE: Record<NlaErrorCode, string> = {
  NLA_NOT_FOUND: "Check the UUID or handle, or search the catalogue first.",
  NLA_AUTHENTICATION_REQUIRED:
    "This endpoint requires authentication; try catalogue search instead.",
  NLA_ACCESS_RESTRICTED:
    "The record or file is restricted by the National Library of Armenia.",
  NLA_RATE_LIMITED:
    "The NLA API is rate-limiting requests; wait briefly and retry.",
  NLA_UPSTREAM_TIMEOUT:
    "The NLA API did not respond in time; retry the read operation.",
  NLA_UPSTREAM_UNAVAILABLE:
    "The NLA API is temporarily unavailable; retry later.",
  NLA_RESPONSE_TOO_LARGE:
    "Request a smaller page or use a more specific query.",
  NLA_INVALID_RESPONSE:
    "The NLA API returned an unexpected response; try another catalogue operation.",
};

export class NlaError extends Error {
  constructor(
    readonly code: NlaErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "NlaError";
  }

  get guidance(): string {
    return GUIDANCE[this.code];
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      guidance: this.guidance,
      details: this.details,
    };
  }

  static fromStatus(status: number, retryAfter?: string | null): NlaError {
    if (status === 401)
      return new NlaError(
        "NLA_AUTHENTICATION_REQUIRED",
        "NLA authentication is required",
        { status },
      );
    if (status === 403)
      return new NlaError("NLA_ACCESS_RESTRICTED", "NLA access is restricted", {
        status,
      });
    if (status === 404)
      return new NlaError("NLA_NOT_FOUND", "NLA resource was not found", {
        status,
      });
    if (status === 429)
      return new NlaError("NLA_RATE_LIMITED", "NLA request was rate limited", {
        status,
        retryAfter,
      });
    if (status >= 500)
      return new NlaError(
        "NLA_UPSTREAM_UNAVAILABLE",
        `NLA upstream returned HTTP ${status}`,
        { status },
      );
    return new NlaError(
      "NLA_INVALID_RESPONSE",
      `Unexpected NLA HTTP status ${status}`,
      { status },
    );
  }

  static invalidResponse(
    message: string,
    details: Record<string, unknown> = {},
  ): NlaError {
    return new NlaError("NLA_INVALID_RESPONSE", message, details);
  }

  static responseTooLarge(limit: number, actual?: number): NlaError {
    return new NlaError(
      "NLA_RESPONSE_TOO_LARGE",
      `NLA response exceeded ${limit} bytes`,
      { limit, actual },
    );
  }
}
