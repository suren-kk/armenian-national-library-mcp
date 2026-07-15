import { describe, expect, it, vi } from "vitest";
import { Logger } from "../../src/observability/logger.js";
import type { Metrics } from "../../src/observability/metrics.js";
import { NlaClient } from "../../src/nla/client.js";
import { NlaError } from "../../src/nla/errors.js";
import { requestUrl, testConfig } from "../helpers.js";

describe("NLA HTTP client", () => {
  it("retries retryable responses and then parses JSON", async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "root", _links: {} }), {
          headers: { "content-type": "application/hal+json" },
        }),
      );
    const client = new NlaClient(
      testConfig().nla,
      fetchMock,
      new Logger("test-client"),
      { random: () => 0, sleep },
    );
    const result = await client.getJson<{ type: string }>("");
    expect(result.data.type).toBe("root");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(113, expect.any(AbortSignal));
  });

  it("reports content-free operational metrics", async () => {
    const increment = vi.fn<Metrics["increment"]>();
    const observe = vi.fn<Metrics["observe"]>();
    const set = vi.fn<Metrics["set"]>();
    const metrics: Metrics = {
      increment,
      observe,
      set,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"ok":true}', {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NlaClient(
      testConfig().nla,
      fetchMock,
      new Logger("test-client"),
      { metrics },
    );

    await client.getJson("core/sites");

    expect(increment).toHaveBeenCalledWith("nla_upstream_requests_total", 1, {
      method: "GET",
      statusClass: "2xx",
    });
    expect(observe).toHaveBeenCalledWith("nla_upstream_response_bytes", 11, {
      method: "GET",
      statusClass: "2xx",
    });
    expect(JSON.stringify(increment.mock.calls)).not.toMatch(/core\/sites|ok/);
  });

  it("uses a fresh cache entry without another request", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ answer: 42 }), {
        headers: { "content-type": "application/json", etag: '"one"' },
      }),
    );
    const client = new NlaClient(
      testConfig({ NLA_CACHE_ENABLED: "true", NLA_CACHE_TTL_MS: "60000" }).nla,
      fetchMock,
    );
    await client.getJson("core/sites");
    const cached = await client.getJson("core/sites");
    expect(cached.cacheHit).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts least-recently-used responses when the cache reaches its bound", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) =>
      Promise.resolve(
        new Response(JSON.stringify({ url: requestUrl(input).toString() }), {
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const client = new NlaClient(
      testConfig({
        NLA_CACHE_ENABLED: "true",
        NLA_CACHE_TTL_MS: "60000",
        NLA_CACHE_MAX_ENTRIES: "1",
      }).nla,
      fetchMock,
    );

    await client.getJson("core/sites");
    await client.getJson("core/communities");
    await client.getJson("core/sites");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("enforces the active byte limit on a cache hit", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ value: "x".repeat(100) }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NlaClient(
      testConfig({ NLA_CACHE_ENABLED: "true", NLA_CACHE_TTL_MS: "60000" }).nla,
      fetchMock,
    );

    await client.getJson("core/sites", { maxResponseBytes: 1_024 });
    await expect(
      client.getJson("core/sites", { maxResponseBytes: 4 }),
    ).rejects.toMatchObject({ code: "NLA_RESPONSE_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("enforces the active byte limit after a 304 revalidation", async () => {
    let now = 1_000;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: "x".repeat(100) }), {
          headers: {
            "content-type": "application/json",
            etag: '"one"',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const client = new NlaClient(
      testConfig({ NLA_CACHE_ENABLED: "true", NLA_CACHE_TTL_MS: "0" }).nla,
      fetchMock,
      new Logger("test-client"),
      { now: () => now },
    );

    await client.getJson("core/sites", { maxResponseBytes: 1_024 });
    now = 1_001;
    await expect(
      client.getJson("core/sites", { maxResponseBytes: 4 }),
    ).rejects.toMatchObject({ code: "NLA_RESPONSE_TOO_LARGE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts cached bodies to stay within the aggregate byte ceiling", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            url: requestUrl(input).pathname,
            padding: "x".repeat(600),
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const client = new NlaClient(
      testConfig({
        NLA_CACHE_ENABLED: "true",
        NLA_CACHE_TTL_MS: "60000",
        NLA_CACHE_MAX_ENTRIES: "10",
        NLA_CACHE_MAX_BYTES: "1024",
      }).nla,
      fetchMock,
    );

    await client.getJson("core/sites");
    await client.getJson("core/communities");
    await client.getJson("core/sites");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("separates cache representations by Accept header", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_input, init) =>
      Promise.resolve(
        new Response(
          JSON.stringify({ accept: new Headers(init?.headers).get("accept") }),
          {
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    const client = new NlaClient(
      testConfig({ NLA_CACHE_ENABLED: "true", NLA_CACHE_TTL_MS: "60000" }).nla,
      fetchMock,
    );

    await client.getJson("core/sites");
    await client.getBytes("core/sites");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent identical GET requests", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);

    const first = client.getJson<{ answer: number }>("core/sites");
    const second = client.getJson<{ answer: number }>("core/sites");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveResponse(
      new Response('{"answer":42}', {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { data: { answer: 42 } },
      { data: { answer: 42 } },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels one coalesced caller without aborting the others", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);
    const controller = new AbortController();

    const first = client.getJson("core/sites", { signal: controller.signal });
    const second = client.getJson<{ answer: number }>("core/sites");
    const firstResult = expect(first).rejects.toThrow("caller stopped");
    controller.abort(new Error("caller stopped"));
    resolveResponse(
      new Response('{"answer":42}', {
        headers: { "content-type": "application/json" },
      }),
    );

    await firstResult;
    await expect(second).resolves.toMatchObject({ data: { answer: 42 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels a caller while it waits for an upstream concurrency slot", async () => {
    let resolveFirst!: (response: Response) => void;
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (url.pathname.endsWith("/core/sites")) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(
        new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
        }),
      );
    });
    const client = new NlaClient(
      testConfig({ NLA_MAX_CONCURRENCY: "1", NLA_CACHE_ENABLED: "false" }).nla,
      fetchMock,
    );
    const first = client.getJson("core/sites");
    const controller = new AbortController();
    const queued = client.getJson("core/communities", {
      signal: controller.signal,
    });
    const queuedResult = expect(queued).rejects.toThrow("no longer needed");

    controller.abort(new Error("no longer needed"));
    await queuedResult;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(
      new Response('{"ok":true}', {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(first).resolves.toMatchObject({ data: { ok: true } });
  });

  it("cancels retry and redirect response bodies before continuing", async () => {
    const retryCancel = vi.fn();
    const redirectCancel = vi.fn();
    const retryBody = new ReadableStream({ cancel: retryCancel });
    const redirectBody = new ReadableStream({ cancel: redirectCancel });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(retryBody, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(redirectBody, {
          status: 302,
          headers: {
            location: "https://api.nla.am/server/api/core/sites",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"ok":true}', {
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new NlaClient(
      testConfig({ NLA_MAX_RETRIES: "1" }).nla,
      fetchMock,
      new Logger("test-client"),
      { sleep: () => Promise.resolve() },
    );

    await expect(client.getJson("core/sites")).resolves.toMatchObject({
      data: { ok: true },
    });
    expect(retryCancel).toHaveBeenCalledTimes(1);
    expect(redirectCancel).toHaveBeenCalledTimes(1);
  });

  it("maps non-retryable HTTP errors", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));
    const client = new NlaClient(testConfig().nla, fetchMock);
    await expect(client.getJson("core/items/private")).rejects.toMatchObject({
      code: "NLA_AUTHENTICATION_REQUIRED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["application/jsonp", "text/json", "application/notjson"])(
    "rejects misleading JSON media type %s",
    async (contentType) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("{}", { headers: { "content-type": contentType } }),
        );
      const client = new NlaClient(testConfig().nla, fetchMock);

      await expect(client.getJson("core/sites")).rejects.toMatchObject({
        code: "NLA_INVALID_RESPONSE",
      });
    },
  );

  it("accepts structured JSON media types", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"ok":true}', {
        headers: { "content-type": "application/hal+json; charset=utf-8" },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);

    await expect(client.getJson("core/sites")).resolves.toMatchObject({
      data: { ok: true },
    });
  });

  it("enforces response size while streaming", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ value: "too large" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);
    await expect(
      client.getJson("core/sites", { maxResponseBytes: 4 }),
    ).rejects.toBeInstanceOf(NlaError);
  });

  it("rejects an excessive encoded upstream URL before fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = new NlaClient(testConfig().nla, fetchMock);

    await expect(
      client.getJson("core/sites", { query: { query: "x".repeat(9_000) } }),
    ).rejects.toMatchObject({ code: "NLA_INVALID_RESPONSE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
