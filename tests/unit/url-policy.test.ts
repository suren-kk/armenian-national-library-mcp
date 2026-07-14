import { describe, expect, it } from "vitest";
import { UrlPolicy } from "../../src/security/url-policy.js";

const policy = new UrlPolicy("https://api.nla.am/server/api", "api.nla.am");

describe("NLA URL policy", () => {
  it("resolves API-relative paths", () => {
    expect(policy.resolve("core/items/abc").toString()).toBe(
      "https://api.nla.am/server/api/core/items/abc",
    );
  });

  it("allows an encoded handle slash inside a query value", () => {
    expect(policy.resolve("pid/find?id=123456789%2F10740").search).toBe(
      "?id=123456789%2F10740",
    );
  });

  it.each([
    "https://example.com/server/api/core/items/abc",
    "//example.com/path",
    "core/%2e%2e/system",
    "../actuator",
  ])("rejects unsafe URL %s", (value) => {
    expect(() => policy.resolve(value)).toThrow();
  });

  it("rejects same-host paths outside the API base", () => {
    expect(() =>
      policy.assertAllowed(new URL("https://api.nla.am/server/actuator")),
    ).toThrow();
  });

  it("maintains the base-path invariant across generated encoding variants", () => {
    const dotVariants = ["..", "%2e%2e", "%2E%2E", "%252e%252e"];
    const separatorVariants = ["/", "%2f", "%2F", "%5c", "%255c"];
    for (const dots of dotVariants) {
      for (const separator of separatorVariants) {
        expect(() =>
          policy.resolve(`core/${dots}${separator}system`),
        ).toThrow();
      }
    }
  });
});
