import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { NlaError } from "../../src/nla/errors.js";
import type { NlaRepository } from "../../src/nla/repository.js";
import { registerTools } from "../../src/tools/register-tools.js";
import { testConfig } from "../helpers.js";

const uuid = "fdff35c4-2c16-481c-9bc8-fee00be21121";
const bitstreamUuid = "4ead233d-ef4d-4db6-b6f4-a5bb3783abf0";
const source = {
  repository: "National Library of Armenia" as const,
  url: "https://api.nla.am/server/api/core/items",
  retrievedAt: "2026-07-14T00:00:00.000Z",
};
const pagination = {
  page: 0,
  pageSize: 10,
  totalElements: 1,
  totalPages: 1,
  hasNext: false,
};
const rights = {
  status: "unknown" as const,
  statements: [],
  uris: [],
  holders: [],
  accessRights: [],
  licences: [],
  reusable: null,
};
const item = {
  type: "item",
  name: "Fixture item",
  metadata: {},
  normalized: {
    uuid,
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
    rights,
    canonicalUrl: "https://dspace.nla.am/handle/123456789/10740",
    lastModified: null,
    inArchive: null,
    discoverable: null,
    withdrawn: null,
  },
};
const resourceLink = {
  type: "resource_link" as const,
  uri: `nla://bitstream/${bitstreamUuid}/content`,
  name: "document.txt",
  description: "NLA TEXT bitstream content",
  mimeType: "text/plain",
  size: 5,
};
const bitstream = {
  uuid: bitstreamUuid,
  filename: "document.txt",
  bundle: "TEXT" as const,
  mimeType: "text/plain",
  detectedMimeType: null,
  mimeVerification: "declared-unverified" as const,
  inlineEligible: true,
  sizeBytes: 5,
  format: {
    id: 6,
    name: "Text",
    description: "Plain text",
    supportLevel: "KNOWN",
    extensions: ["txt"],
  },
  access: {
    status: "open.access",
    embargoDate: null,
    publiclyReadable: true,
  },
  checksum: null,
  metadata: {},
  resourceLink,
  metadataResource: `nla://bitstream/${bitstreamUuid}`,
  downloadUrl: `https://api.nla.am/server/api/core/bitstreams/${bitstreamUuid}/content`,
};

function envelope<T>(data: T, page = null as typeof pagination | null) {
  return { data, pagination: page, source, warnings: [], truncated: false };
}

function repositoryFixture(): NlaRepository {
  const search = envelope(
    {
      results: [{ ...item, highlights: {} }],
      facets: [],
      appliedFilters: null,
      query: "fixture",
    },
    pagination,
  );
  const json = envelope({ status: "ok" });
  return {
    search: () => Promise.resolve(search),
    facets: () => Promise.resolve(envelope([])),
    browse: () =>
      Promise.resolve(envelope({ mode: "entries", values: [] }, pagination)),
    listCommunities: () => Promise.resolve(envelope([item], pagination)),
    getCommunity: () => Promise.resolve(envelope(item)),
    listSubcommunities: () => Promise.resolve(envelope([item], pagination)),
    listCommunityCollections: () =>
      Promise.resolve(envelope([item], pagination)),
    listCollections: () => Promise.resolve(envelope([item], pagination)),
    getCollection: () => Promise.resolve(envelope(item)),
    listCollectionItems: () => Promise.resolve(search),
    getItem: () => Promise.resolve(envelope(item)),
    getItemAccessStatus: () => Promise.resolve(json),
    listItemFiles: () =>
      Promise.resolve(
        envelope(
          {
            item,
            bundles: [
              {
                uuid,
                name: "TEXT",
                classification: "TEXT",
                files: [bitstream],
                filesTruncated: false,
                filesPagination: pagination,
              },
            ],
          },
          pagination,
        ),
      ),
    getItemText: () =>
      Promise.resolve(
        envelope({
          itemUuid: uuid,
          bitstreamUuid,
          filename: "document.txt",
          mimeType: "text/plain",
          text: "hello",
          offsetChars: 0,
          returnedChars: 5,
          totalChars: 5,
          nextOffset: null,
          provenance: {
            kind: "nla-provided-extracted-text",
            label: "NLA-provided extracted text",
            bundle: "TEXT",
            derivedLocally: false,
            untrustedSourceData: true,
          },
          resourceLink,
          downloadUrl: bitstream.downloadUrl,
        }),
      ),
    getBitstream: () => Promise.resolve(envelope(bitstream)),
    getFileDownload: () => Promise.resolve(envelope(bitstream)),
    getItemRelationships: () => Promise.resolve(json),
    getItemVersion: () => Promise.resolve(json),
    getItemIdentifiers: () => Promise.resolve(json),
    resolveIdentifier: () => Promise.resolve(envelope(item)),
    getApiCapabilities: () =>
      envelope({
        profile: "public-read",
        allowedMethods: ["GET", "HEAD"],
        mutationAllowed: false,
        arbitraryUrlsAllowed: false,
        bitstreamContentViaRawApi: false,
        summary: {
          totalRelations: 80,
          rawReadableRelations: 10,
          semanticRelations: 20,
          byAccess: { public: 1 },
          byRisk: { read: 1 },
          byFamily: { core: 1 },
          semanticTools: ["search_catalog"],
        },
        rawAllowedPaths: ["/core/sites"],
      }),
    rawApiGet: () =>
      Promise.resolve(
        envelope({
          method: "GET",
          path: "/core/sites",
          status: 200,
          contentType: "application/json",
          body: {},
        }),
      ),
  } as unknown as NlaRepository;
}

const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [
  { name: "get_repository_info", arguments: {} },
  { name: "search_catalog", arguments: { query: "fixture" } },
  { name: "get_search_facets", arguments: {} },
  { name: "browse_catalog", arguments: { index: "author" } },
  { name: "list_communities", arguments: {} },
  { name: "get_community", arguments: { uuid } },
  { name: "list_subcommunities", arguments: { community_uuid: uuid } },
  { name: "list_community_collections", arguments: { community_uuid: uuid } },
  { name: "list_collections", arguments: {} },
  { name: "get_collection", arguments: { uuid } },
  { name: "list_collection_items", arguments: { collection_uuid: uuid } },
  { name: "get_item", arguments: { item_id: uuid } },
  { name: "get_item_access_status", arguments: { item_id: uuid } },
  { name: "list_item_files", arguments: { item_id: uuid } },
  { name: "get_item_text", arguments: { item_id: uuid } },
  { name: "get_bitstream", arguments: { bitstream_uuid: bitstreamUuid } },
  { name: "get_file_download", arguments: { bitstream_uuid: bitstreamUuid } },
  { name: "get_item_relationships", arguments: { item_id: uuid } },
  { name: "get_item_version", arguments: { item_id: uuid } },
  { name: "get_item_identifiers", arguments: { item_id: uuid } },
  { name: "resolve_identifier", arguments: { identifier: uuid } },
  { name: "get_api_capabilities", arguments: {} },
  { name: "nla_api_get", arguments: { path: "/core/sites" } },
];

describe("all MCP tool contracts", () => {
  const connected: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(connected.splice(0).map((value) => value.close()));
  });

  it("advertises concrete output schemas and validates every success shape", async () => {
    const server = new McpServer({ name: "contract-server", version: "1.0.0" });
    registerTools(server, repositoryFixture(), testConfig());
    const client = new Client({ name: "contract-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    connected.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(calls.length);
    for (const tool of listed.tools) {
      if (tool.name === "get_repository_info") continue;
      expect(tool.outputSchema?.properties).toHaveProperty("data");
      expect(tool.outputSchema?.properties).toHaveProperty("source");
      expect(tool.outputSchema?.properties).toHaveProperty("warnings");
    }

    for (const call of calls) {
      const result = CallToolResultSchema.parse(await client.callTool(call));
      expect(result.isError, call.name).not.toBe(true);
      expect(result.structuredContent, call.name).toBeDefined();
      const text = result.content.find((entry) => entry.type === "text");
      expect(text, call.name).toBeDefined();
      if (text?.type === "text") {
        expect(JSON.parse(text.text), call.name).toEqual(
          result.structuredContent,
        );
      }
    }
  });

  it("maps every semantic tool failure through the stable MCP error boundary", async () => {
    const failure = new NlaError("NLA_NOT_FOUND", "Fixture was not found");
    const repository = new Proxy(
      {},
      {
        get: (_target, property) =>
          property === "getApiCapabilities"
            ? () => {
                throw failure;
              }
            : () => Promise.reject(failure),
      },
    ) as NlaRepository;
    const server = new McpServer({ name: "failure-server", version: "1.0.0" });
    registerTools(server, repository, testConfig());
    const client = new Client({ name: "failure-client", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    connected.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    for (const call of calls.filter(
      ({ name }) => name !== "get_repository_info",
    )) {
      const result = CallToolResultSchema.parse(await client.callTool(call));
      expect(result.isError, call.name).toBe(true);
      const text = result.content.find((entry) => entry.type === "text");
      expect(text?.type, call.name).toBe("text");
      if (text?.type === "text") {
        expect(JSON.parse(text.text), call.name).toMatchObject({
          code: "NLA_NOT_FOUND",
          message: "Fixture was not found",
        });
      }
    }
  });
});
