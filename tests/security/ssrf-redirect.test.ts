import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { validatedLinks } from "../../src/nla/hal.js";
import { NlaClient } from "../../src/nla/client.js";
import type { HalDocument } from "../../src/nla/types.js";
import { UrlPolicy } from "../../src/security/url-policy.js";
import { requestUrl, testConfig } from "../helpers.js";

const API_ROOT = "https://api.nla.am/server/api";

describe("SSRF and redirect defenses", () => {
  it("fixes the upstream hostname to the public NLA API", () => {
    expect(() =>
      loadConfig({
        NLA_API_BASE_URL: "https://127.0.0.1/server/api",
        NLA_ALLOWED_HOST: "127.0.0.1",
      }),
    ).toThrow();
    expect(
      () => new UrlPolicy("https://localhost/server/api", "localhost"),
    ).toThrow();
  });

  it.each([
    "http://api.nla.am/server/api/core/items/one",
    "https://api.nla.am.evil.example/server/api/core/items/one",
    "https://api.nla.am@127.0.0.1/server/api/core/items/one",
    "https://127.0.0.1/server/api/core/items/one",
    "https://[::1]/server/api/core/items/one",
    "https://10.0.0.1/server/api/core/items/one",
    "https://api.nla.am:8443/server/api/core/items/one",
    "https://api.nla.am/server/private",
    "https://api.nla.am/server/api/core/%252e%252e/system",
    "core/%252e%252e/system",
    "core/items%2f..%2fsystem",
    "core/items%00/one",
  ])("rejects an unsafe upstream target %s", (target) => {
    const policy = new UrlPolicy(API_ROOT, "api.nla.am");
    expect(() => policy.resolve(target)).toThrow();
  });

  it("allows encoded handle separators only in query values", () => {
    const policy = new UrlPolicy(API_ROOT, "api.nla.am");
    expect(policy.resolve("pid/find?id=123456789%2F10740").search).toBe(
      "?id=123456789%2F10740",
    );
  });

  it.each([
    "http://api.nla.am/server/api/core/sites",
    "https://example.com/server/api/core/sites",
    "https://127.0.0.1/server/api/core/sites",
    "https://api.nla.am/server/actuator",
    "https://api.nla.am/server/api/core/%252e%252e/system",
    "//example.com/server/api/core/sites",
  ])("rejects an unsafe redirect before following %s", async (location) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location },
      }),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);

    await expect(client.getJson("core/sites")).rejects.toMatchObject({
      code: "NLA_INVALID_RESPONSE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows bounded same-origin redirects", async () => {
    const redirectedUrl = `${API_ROOT}/core/sites?page=0`;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: redirectedUrl },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: "sites", _links: {} }), {
          headers: { "content-type": "application/hal+json" },
        }),
      );
    const client = new NlaClient(testConfig().nla, fetchMock);

    await expect(client.getJson("core/sites")).resolves.toMatchObject({
      data: { type: "sites" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestUrl(fetchMock.mock.calls[1]?.[0] ?? "").toString()).toBe(
      redirectedUrl,
    );
  });

  it("stops redirect chains at the configured bound", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: `${API_ROOT}/core/sites` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: `${API_ROOT}/core/communities` },
        }),
      );
    const client = new NlaClient(
      testConfig({ NLA_MAX_REDIRECTS: "1" }).nla,
      fetchMock,
    );

    await expect(client.getJson("core/sites")).rejects.toMatchObject({
      code: "NLA_INVALID_RESPONSE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates ordinary and templated HAL links before use", () => {
    const policy = new UrlPolicy(API_ROOT, "api.nla.am");
    const document: HalDocument = {
      _links: {
        self: { href: `${API_ROOT}/core/sites` },
        search: {
          href: "https://127.0.0.1/server/api/core/items{?query}",
          templated: true,
        },
      },
    };

    expect(() => validatedLinks(document, policy)).toThrow();
  });

  it("rejects unsafe path encoding in a same-origin HAL link", () => {
    const policy = new UrlPolicy(API_ROOT, "api.nla.am");
    const document: HalDocument = {
      _links: {
        unsafe: {
          href: `${API_ROOT}/core/%252e%252e/system`,
        },
      },
    };

    expect(() => validatedLinks(document, policy)).toThrow();
  });

  it.each([
    { href: "{scheme}://127.0.0.1/server/api", templated: true },
    { href: `${API_ROOT}/core/items{?id}`, templated: false },
    { href: `${API_ROOT}/core/items`, templated: true },
  ])("rejects a malformed HAL URI template %#", (link) => {
    const policy = new UrlPolicy(API_ROOT, "api.nla.am");
    expect(() =>
      validatedLinks({ _links: { unsafe: link } }, policy),
    ).toThrow();
  });
});
