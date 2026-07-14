import { describe, expect, it } from "vitest";
import { HttpConcurrencyLimiter } from "../../src/security/concurrency-limiter.js";

describe("HTTP concurrency limiter", () => {
  it("bounds global and per-client in-flight work and releases state", () => {
    const limiter = new HttpConcurrencyLimiter({
      globalLimit: 2,
      perClientLimit: 1,
    });

    const releaseA = limiter.acquire("client-a");
    expect(releaseA).not.toBeNull();
    expect(limiter.acquire("client-a")).toBeNull();
    const releaseB = limiter.acquire("client-b");
    expect(releaseB).not.toBeNull();
    expect(limiter.acquire("client-c")).toBeNull();
    expect(limiter.snapshot()).toEqual({ active: 2, identities: 2 });

    releaseA?.();
    expect(limiter.acquire("client-c")).not.toBeNull();
    releaseA?.();
    releaseB?.();
  });
});
