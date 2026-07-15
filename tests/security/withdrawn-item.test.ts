import { describe, expect, it, vi } from "vitest";
import type { NlaClient } from "../../src/nla/client.js";
import type { NlaContentResolver } from "../../src/nla/content-resolver.js";
import { NlaRepository } from "../../src/nla/repository.js";
import type { NormalizedDspaceObject } from "../../src/nla/types.js";
import { testConfig } from "../helpers.js";

function withdrawnItem(): NormalizedDspaceObject {
  return {
    type: "item",
    name: "Withdrawn fixture",
    metadata: {},
    normalized: {
      uuid: "fdff35c4-2c16-481c-9bc8-fee00be21121",
      handle: "123456789/10740",
      title: [],
      authors: [],
      contributors: [],
      subjects: [],
      descriptions: [],
      abstracts: [],
      languages: [],
      dateIssued: [],
      publisher: [],
      publicationPlace: [],
      documentType: [],
      pages: [],
      identifiers: [],
      rights: {
        status: "unknown",
        statements: [],
        uris: [],
        holders: [],
        accessRights: [],
        licences: [],
        reusable: null,
      },
      canonicalUrl: "https://dspace.nla.am/handle/123456789/10740",
      lastModified: null,
      inArchive: true,
      discoverable: false,
      withdrawn: true,
    },
  };
}

describe("withdrawn item content boundary", () => {
  it("blocks file enumeration and text resolution before content calls", async () => {
    const config = testConfig();
    const listItemFiles = vi.fn();
    const getItemText = vi.fn();
    const content = {
      listItemFiles,
      getItemText,
    } as unknown as NlaContentResolver;
    const repository = new NlaRepository(
      { config: config.nla } as NlaClient,
      content,
      [],
    );
    vi.spyOn(repository, "getItem").mockResolvedValue({
      data: withdrawnItem(),
      pagination: null,
      source: {
        repository: "National Library of Armenia",
        url: "https://api.nla.am/server/api/core/items/fixture",
        retrievedAt: "2026-07-15T00:00:00.000Z",
      },
      warnings: [],
      truncated: false,
    });

    await expect(
      repository.listItemFiles("123456789/10740"),
    ).rejects.toMatchObject({ code: "NLA_ACCESS_RESTRICTED" });
    await expect(
      repository.getItemText("123456789/10740", {
        offsetChars: 0,
        maxChars: 8_000,
      }),
    ).rejects.toMatchObject({ code: "NLA_ACCESS_RESTRICTED" });
    expect(listItemFiles).not.toHaveBeenCalled();
    expect(getItemText).not.toHaveBeenCalled();
  });
});
