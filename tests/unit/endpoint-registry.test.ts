import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import {
  checkEndpointRegistryDrift,
  concreteEndpointPath,
  getDefaultEndpointRegistry,
  loadEndpointRegistry,
  normalizeAdvertisedPath,
  summarizeEndpointRegistry,
  type EndpointRecord,
} from "../../src/nla/endpoint-registry.js";
import { requestUrl, testConfig } from "../helpers.js";

const apiBaseUrl = "https://api.nla.am/server/api";

function hrefFor(record: EndpointRecord): string {
  if (record.path === "/") return apiBaseUrl;
  if (record.path.startsWith("/server/"))
    return `https://api.nla.am${record.path}`;
  return `${apiBaseUrl}${record.path}`;
}

describe("endpoint registry", () => {
  it("shares one frozen default registry instance", () => {
    const first = getDefaultEndpointRegistry();
    const second = getDefaultEndpointRegistry();
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every((record) => Object.isFrozen(record))).toBe(true);
  });

  it("loads one validated record for every known root relation", () => {
    const records = loadEndpointRegistry();
    expect(records).toHaveLength(80);
    expect(new Set(records.map((record) => record.relation)).size).toBe(80);
    expect(records.map((record) => record.relation)).toEqual(
      expect.arrayContaining([
        "communities",
        "discover",
        "workspaceitems",
        "vocabularyEntryDetails-search",
      ]),
    );
    const summary = summarizeEndpointRegistry(records);
    expect(summary.totalRelations).toBe(80);
    expect(summary.byFamily.core).toBeGreaterThan(0);
    expect(summary.byFamily.discover).toBeGreaterThan(0);
    expect(summary.byFamily.submission).toBeGreaterThan(0);
    expect(summary.byFamily.workflow).toBeGreaterThan(0);
    expect(
      records.filter(
        (record) => record.rawAllowed && record.access === "authenticated",
      ),
    ).toEqual([]);
    expect(
      records.filter(
        (record) =>
          record.semanticTool === null &&
          !record.rawAllowed &&
          record.risk === "read" &&
          record.access === "public",
      ),
    ).toEqual([]);
  });

  it("normalizes API-relative, templated, root, and outside-base links", () => {
    expect(
      normalizeAdvertisedPath(`${apiBaseUrl}/core/items`, apiBaseUrl),
    ).toBe("/core/items");
    expect(
      normalizeAdvertisedPath(`${apiBaseUrl}/dso/find{?uuid}`, apiBaseUrl),
    ).toBe("/dso/find{?uuid}");
    expect(normalizeAdvertisedPath(apiBaseUrl, apiBaseUrl)).toBe("/");
    expect(
      normalizeAdvertisedPath(`${apiBaseUrl}{?projection}`, apiBaseUrl),
    ).toBe("/{?projection}");
    expect(
      normalizeAdvertisedPath("https://api.nla.am/server/actuator", apiBaseUrl),
    ).toBe("/server/actuator");
    expect(concreteEndpointPath("/dso/find{?uuid}")).toBe("/dso/find");
  });

  it("reports new, removed, and changed root relations", async () => {
    const records = loadEndpointRegistry();
    const links = Object.fromEntries(
      records
        .filter((record) => record.relation !== "captcha")
        .map((record) => [
          record.relation,
          {
            href:
              record.relation === "collections"
                ? `${apiBaseUrl}/core/renamed-collections`
                : hrefFor(record),
            ...(record.templated ? { templated: true } : {}),
          },
        ]),
    );
    links.newrelation = { href: `${apiBaseUrl}/core/newrelation` };
    const fetchMock = vi.fn<typeof fetch>((input) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            type: "root",
            _links: links,
            requestedUrl: requestUrl(input).toString(),
          }),
          { headers: { "content-type": "application/hal+json" } },
        ),
      ),
    );
    const client = new NlaClient(testConfig().nla, fetchMock);
    const report = await checkEndpointRegistryDrift(client, records);

    expect(report.hasDrift).toBe(true);
    expect(report.newRelations.map((record) => record.relation)).toEqual([
      "newrelation",
    ]);
    expect(report.removedRelations.map((record) => record.relation)).toEqual([
      "captcha",
    ]);
    expect(report.changedUrls).toEqual([
      expect.objectContaining({
        relation: "collections",
        actualPath: "/core/renamed-collections",
      }),
    ]);
  });

  it("reports anonymous access changes in both directions", async () => {
    const records = loadEndpointRegistry().filter((record) =>
      ["bulkaccessconditionoptions", "communities"].includes(record.relation),
    );
    const links = Object.fromEntries(
      records.map((record) => [record.relation, { href: hrefFor(record) }]),
    );
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (!url.pathname.endsWith("/api")) {
        return Promise.resolve(
          new Response(null, {
            status: url.pathname.endsWith("/communities") ? 401 : 200,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ type: "root", _links: links }), {
          headers: { "content-type": "application/hal+json" },
        }),
      );
    });
    const report = await checkEndpointRegistryDrift(
      new NlaClient(testConfig().nla, fetchMock),
      records,
      { checkAccess: true },
    );

    expect(report.changedAnonymousAccess).toEqual([
      {
        relation: "bulkaccessconditionoptions",
        expected: "authenticated",
        actual: "public",
      },
      {
        relation: "communities",
        expected: "public",
        actual: "authentication-required",
      },
    ]);
    expect(report.hasDrift).toBe(true);
  });

  it("distinguishes approved non-probeable relations from unexpected skips", async () => {
    const records = loadEndpointRegistry().filter(
      (record) => record.relation === "authorizations",
    );
    const links = Object.fromEntries(
      records.map((record) => [record.relation, { href: hrefFor(record) }]),
    );
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (!url.pathname.endsWith("/api")) {
        throw new Error("approved exception must not be probed");
      }
      return Promise.resolve(
        new Response(JSON.stringify({ type: "root", _links: links }), {
          headers: { "content-type": "application/hal+json" },
        }),
      );
    });
    const report = await checkEndpointRegistryDrift(
      new NlaClient(testConfig().nla, fetchMock),
      records,
      { checkAccess: true },
    );

    expect(report.accessChecksNotProbeable).toEqual(["authorizations"]);
    expect(report.accessChecksSkipped).toEqual([]);
    expect(report.hasDrift).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an inconclusive direct access probe as drift", async () => {
    const records = loadEndpointRegistry().filter(
      (record) => record.relation === "communities",
    );
    const links = Object.fromEntries(
      records.map((record) => [record.relation, { href: hrefFor(record) }]),
    );
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      return Promise.resolve(
        url.pathname.endsWith("/api")
          ? new Response(JSON.stringify({ type: "root", _links: links }), {
              headers: { "content-type": "application/hal+json" },
            })
          : new Response(null, { status: 404 }),
      );
    });
    const report = await checkEndpointRegistryDrift(
      new NlaClient(testConfig().nla, fetchMock),
      records,
      { checkAccess: true },
    );

    expect(report.accessChecksSkipped).toEqual(["communities"]);
    expect(report.hasDrift).toBe(true);
  });
});
