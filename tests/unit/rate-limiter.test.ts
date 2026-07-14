import { describe, expect, it } from "vitest";
import { HttpRateLimiter } from "../../src/security/rate-limiter.js";

describe("HTTP rate limiter", () => {
  it("enforces per-client limits and resets after the window", () => {
    let now = 1_000;
    const limiter = new HttpRateLimiter({
      windowMs: 10_000,
      perClientLimit: 2,
      globalLimit: 10,
      now: () => now,
    });

    expect(limiter.check("client-a")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(limiter.check("client-a")).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(limiter.check("client-a")).toMatchObject({
      allowed: false,
      scope: "client",
      retryAfterSeconds: 10,
    });
    expect(limiter.check("client-b").allowed).toBe(true);

    now += 10_000;
    expect(limiter.check("client-a")).toMatchObject({
      allowed: true,
      remaining: 1,
    });
  });

  it("enforces the global limit across clients", () => {
    const limiter = new HttpRateLimiter({
      windowMs: 60_000,
      perClientLimit: 5,
      globalLimit: 2,
      now: () => 1_000,
    });

    expect(limiter.check("client-a").allowed).toBe(true);
    expect(limiter.check("client-b").allowed).toBe(true);
    expect(limiter.check("client-c")).toMatchObject({
      allowed: false,
      scope: "global",
      remaining: 0,
    });
  });
});
