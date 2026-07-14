import { describe, expect, it } from "vitest";
import { stripUpstreamLinks } from "../../src/security/output-sanitizer.js";

describe("upstream semantic output sanitization", () => {
  it("removes HAL links recursively while retaining ordinary data", () => {
    expect(
      stripUpstreamLinks({
        title: "record",
        _links: { self: { href: "https://attacker.example/top" } },
        nested: [
          {
            value: "preserved",
            _links: { file: { href: "file:///etc/passwd" } },
          },
        ],
      }),
    ).toEqual({
      title: "record",
      nested: [{ value: "preserved" }],
    });
  });
});
