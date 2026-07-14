import { describe, expect, it } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaRepository } from "../../src/nla/repository.js";
import { loadConfig } from "../../src/config.js";

const live = process.env.NLA_LIVE_TESTS === "true";

describe.skipIf(!live)("live NLA smoke tests", () => {
  const client = new NlaClient(loadConfig().nla);
  const repository = new NlaRepository(client);

  it("identifies DSpace and searches the catalogue", async () => {
    const root = await client.getJson<{
      dspaceName: string;
      dspaceVersion: string;
    }>("");
    expect(root.data.dspaceName).toContain("DSpace");
    const search = await repository.search({
      query: "Armenia",
      dso_type: "item",
      page: 0,
      page_size: 1,
      filters: [],
      include_metadata: true,
    });
    expect(search.pagination?.totalElements).toBeGreaterThan(0);
  });

  it("retrieves a known item and enumerates its bundles", async () => {
    const item = await repository.getItem("123456789/10740");
    expect(item.data.normalized.handle).toBe("123456789/10740");
    const bundles = await repository.listItemFiles(item.data.normalized.uuid);
    expect(bundles.data).toBeTruthy();
  });

  it("reads the known 83 KB extraction and returns its original PDF link", async () => {
    const text = await repository.getItemText("123456789/10740", {
      offsetChars: 0,
      maxChars: 20_000,
    });
    expect(text.data.provenance.kind).toBe("nla-provided-extracted-text");
    expect(text.data.returnedChars).toBe(20_000);
    expect(text.data.totalChars).toBeGreaterThan(50_000);
    expect(text.data.nextOffset).toBe(20_000);

    const files = await repository.listItemFiles("123456789/10740");
    const original = files.data.bundles
      .find((bundle) => bundle.classification === "ORIGINAL")
      ?.files.find((file) => file.mimeType === "application/pdf");
    expect(original).toMatchObject({
      access: { publiclyReadable: true },
      resourceLink: { type: "resource_link" },
    });
    expect(original?.downloadUrl).toContain("/core/bitstreams/");
    expect(original?.downloadUrl.endsWith("/content")).toBe(true);
  });

  it("matches the live endpoint root and supports a controlled raw read", async () => {
    const drift = await repository.checkEndpointDrift(false);
    expect(drift).toMatchObject({
      registryRelations: 80,
      advertisedRelations: 80,
      hasDrift: false,
    });

    const raw = await repository.rawApiGet({
      method: "GET",
      path: "/core/communities",
      query: {},
      page: 0,
      pageSize: 1,
    });
    expect(raw.data).toMatchObject({ status: 200 });
    const contentType = (raw.data as { contentType?: unknown }).contentType;
    expect(contentType).toEqual(expect.stringContaining("json"));
    expect(raw.pagination?.pageSize).toBe(1);
  });
});
