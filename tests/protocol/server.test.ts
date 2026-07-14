import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../../src/server/create-server.js";
import { testConfig } from "../helpers.js";

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

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "get_repository_info",
        "search_catalog",
        "resolve_identifier",
      ]),
    );
    expect(tools.tools).toHaveLength(21);

    const result = await client.callTool({
      name: "get_repository_info",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      status: "ok",
      profile: "public-read",
    });
    expect(result.isError).not.toBe(true);
  });
});
