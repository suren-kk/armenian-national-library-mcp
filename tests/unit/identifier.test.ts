import { describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaRepository } from "../../src/nla/repository.js";
import { testConfig } from "../helpers.js";

describe("canonical identifier parsing", () => {
  it.each([
    "https://user@dspace.nla.am/handle/123456789/10740",
    "https://dspace.nla.am:444/handle/123456789/10740",
    "https://dspace.nla.am/handle/123456789/10740?download=true",
    "https://dspace.nla.am/handle/123456789/10740#fragment",
    "http://dspace.nla.am/handle/123456789/10740",
    "https://example.org/handle/123456789/10740",
  ])("rejects non-canonical handle URL %s", async (identifier) => {
    const fetchMock = vi.fn<typeof fetch>();
    const repository = new NlaRepository(
      new NlaClient(testConfig().nla, fetchMock),
    );

    await expect(
      repository.resolveIdentifier(identifier),
    ).rejects.toMatchObject({ code: "NLA_INVALID_RESPONSE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
