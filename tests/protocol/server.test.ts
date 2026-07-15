import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/create-server.js";
import { testConfig } from "../helpers.js";

function schemaDescription(value: unknown): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>).description
    : undefined;
}

describe("MCP protocol", () => {
  const connected: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(connected.splice(0).map((value) => value.close()));
  });

  it("initializes, lists tools, and calls the health tool", async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = createServer(testConfig());
    const client = new Client({ name: "test-client", version: "1.0.0" });
    connected.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    expect(client.getServerVersion()).toEqual({
      name: "armenian-national-library-mcp",
      version: "1.0.0",
    });

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_repository_info",
        "search_catalog",
        "resolve_identifier",
      ]),
    );
    expect(tools.tools).toHaveLength(23);
    for (const tool of tools.tools) {
      expect(tool.description, tool.name).toMatch(/read-only/i);
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
    const searchTool = tools.tools.find(
      ({ name }) => name === "search_catalog",
    );
    const searchProperties = searchTool?.inputSchema.properties as
      Record<string, unknown> | undefined;
    expect(schemaDescription(searchProperties?.sort)).toEqual(
      expect.stringContaining("field,ASC"),
    );
    expect(schemaDescription(searchProperties?.filters)).toEqual(
      expect.stringContaining("get_search_facets"),
    );

    const result = await client.callTool({
      name: "get_repository_info",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      profile: "public-read",
      projectStatus: "independent-unofficial-research",
      maintainer: "Suren Karapetyan",
    });
    expect(result.isError).not.toBe(true);

    const capabilities = await client.callTool({
      name: "get_api_capabilities",
      arguments: { include_endpoints: false },
    });
    expect(capabilities.structuredContent).toMatchObject({
      data: { profile: "public-read", summary: { totalRelations: 80 } },
    });
    const rawAllowedPaths = (
      capabilities.structuredContent as {
        data?: { rawAllowedPaths?: unknown };
      }
    ).data?.rawAllowedPaths;
    expect(rawAllowedPaths).toEqual(
      expect.arrayContaining(["/dso/find", "/pid/find"]),
    );
    expect(rawAllowedPaths).not.toEqual(
      expect.arrayContaining(["/dso/find{?uuid}", "/pid/find{?id}"]),
    );
  });
});
