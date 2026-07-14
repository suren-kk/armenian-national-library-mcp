import { describe, expect, it } from "vitest";
import { loadEndpointRegistry } from "../../src/nla/endpoint-registry.js";
import { assertRawApiPath } from "../../src/security/raw-api-policy.js";

const records = loadEndpointRegistry();

describe("controlled raw API path policy", () => {
  it.each([
    "/",
    "/core/communities",
    "/core/items/fdff35c4-2c16-481c-9bc8-fee00be21121/bundles",
    "/discover/search/objects",
    "/pid/find",
  ])("allows registered read path %s", (path) => {
    expect(() => assertRawApiPath(path, records)).not.toThrow();
  });

  it.each([
    "https://example.com/data",
    "//example.com/data",
    "/../system/scripts",
    "/%2e%2e/system/scripts",
    "/%252e%252e/system/scripts",
    "/core/communities%3fsize=1000",
    "/core/communities%23fragment",
    "/core/communities%00",
    "/core%253a%252f%252fevil.example/communities",
    "/%25252525252e%25252525252e/system/scripts",
    "/core/items?size=1000",
    "/authn",
    "/system/scripts",
    "/core/bitstreams/c81247ed-05ac-47e1-8eef-b7b0290d73ec/content",
    "/core/bitstreams/not-a-uuid/content",
    "/core/bitstreams/not-a-uuid/content/extra",
  ])("rejects unsafe or unapproved path %s", (path) => {
    expect(() => assertRawApiPath(path, records)).toThrow();
  });
});
