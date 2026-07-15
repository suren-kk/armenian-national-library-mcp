import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { NlaRepository } from "../../src/nla/repository.js";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server/create-server.js";

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
      inlineEligible: false,
      mimeVerification: "declared-unverified",
      resourceLink: null,
    });
    expect(original?.downloadUrl).toContain("/core/bitstreams/");
    expect(original?.downloadUrl?.endsWith("/content")).toBe(true);
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

  it("discovers refinements and browses a semantic index", async () => {
    const facets = await repository.facets({
      query: "Armenia",
      page: 0,
      page_size: 2,
    });
    expect(facets.data).toBeTruthy();

    const browse = await repository.browse({
      index: "author",
      page: 0,
      page_size: 2,
    });
    expect(browse.data).toMatchObject({ mode: "entries" });
    expect((browse.data as { values?: unknown[] }).values).toBeInstanceOf(
      Array,
    );
  });

  it("traverses hierarchy and performs a collection-scoped search", async () => {
    const communities = await repository.listCommunities({
      page: 0,
      page_size: 1,
    });
    const community = communities.data[0];
    expect(community).toBeDefined();
    if (community) {
      await expect(
        repository.getCommunity(community.normalized.uuid),
      ).resolves.toMatchObject({ data: { type: "community" } });
    }

    const collections = await repository.listCollections({
      page: 0,
      page_size: 1,
    });
    const collection = collections.data[0];
    expect(collection).toBeDefined();
    if (collection) {
      const scoped = await repository.listCollectionItems(
        collection.normalized.uuid,
        { query: "*", page: 0, page_size: 1 },
      );
      expect((scoped.data as { results?: unknown[] }).results).toBeInstanceOf(
        Array,
      );
    }
  });

  it("checks access, identifier variants, and a protected journey", async () => {
    const item = await repository.getItem("123456789/10740");
    const uuid = item.data.normalized.uuid;
    const canonical = await repository.resolveIdentifier(
      "https://dspace.nla.am/handle/123456789/10740",
    );
    const byUuid = await repository.resolveIdentifier(uuid);
    expect(canonical.data.normalized.uuid).toBe(uuid);
    expect(byUuid.data.normalized.uuid).toBe(uuid);

    const access = await repository.getItemAccessStatus(uuid);
    expect(access.data).toBeTruthy();

    await expect(
      repository.rawApiGet({
        method: "GET",
        path: "/core/items",
        query: {},
        page: 0,
        pageSize: 1,
      }),
    ).rejects.toMatchObject({ code: "NLA_AUTHENTICATION_REQUIRED" });
  });

  it("reads live bitstream metadata through the MCP resource contract", async () => {
    const files = await repository.listItemFiles("123456789/10740");
    const bitstream = files.data.bundles.flatMap(({ files }) => files)[0];
    expect(bitstream).toBeDefined();
    if (!bitstream) return;

    const config = loadConfig();
    const server = createServer(config, { client });
    const mcpClient = new Client({ name: "live-resource", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([
        server.connect(serverTransport),
        mcpClient.connect(clientTransport),
      ]);
      const resource = await mcpClient.readResource({
        uri: `nla://bitstream/${bitstream.uuid}`,
      });
      const content = resource.contents[0];
      expect(content && "text" in content).toBe(true);
      if (content && "text" in content) {
        expect(JSON.parse(content.text)).toMatchObject({
          data: { uuid: bitstream.uuid },
        });
      }
    } finally {
      await Promise.all([mcpClient.close(), server.close()]);
    }
  });
});
