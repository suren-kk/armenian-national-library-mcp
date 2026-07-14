import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  HttpRequestPolicy,
  normalizeHostAuthority,
  normalizeOrigin,
} from "../../src/security/http-request-policy.js";

describe("HTTP request policy", () => {
  it("normalizes host authorities without trusting ports or userinfo", () => {
    expect(normalizeHostAuthority("LOCALHOST:3000")).toBe("localhost");
    expect(normalizeHostAuthority("[::1]:3000")).toBe("[::1]");
    expect(normalizeHostAuthority("evil.example@localhost")).toBeNull();
    expect(normalizeHostAuthority("localhost/evil")).toBeNull();
  });

  it("requires an allowlisted Host and validates Origin when present", () => {
    const policy = new HttpRequestPolicy({
      allowedHosts: ["127.0.0.1", "localhost"],
      allowedOrigins: ["https://client.example"],
      trustProxy: false,
    });

    expect(policy.isHostAllowed("localhost:3000")).toBe(true);
    expect(policy.isHostAllowed("localhost.evil.example")).toBe(false);
    expect(policy.isHostAllowed(undefined)).toBe(false);
    expect(policy.isOriginAllowed(undefined)).toBe(true);
    expect(policy.isOriginAllowed("https://client.example")).toBe(true);
    expect(policy.isOriginAllowed("https://evil.example")).toBe(false);
    expect(normalizeOrigin("https://client.example/path")).toBeNull();
  });

  it("uses forwarded client IPs only when proxy trust is explicit", () => {
    const request = {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.2" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as IncomingMessage;
    const direct = new HttpRequestPolicy({
      allowedHosts: ["localhost"],
      allowedOrigins: ["https://client.example"],
      trustProxy: false,
    });
    const proxied = new HttpRequestPolicy({
      allowedHosts: ["localhost"],
      allowedOrigins: ["https://client.example"],
      trustProxy: true,
    });

    expect(direct.clientId(request)).toBe("127.0.0.1");
    expect(proxied.clientId(request)).toBe("203.0.113.5");
  });
});
