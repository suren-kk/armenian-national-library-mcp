import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createServer } from "../../src/server/create-server.js";
import { testConfig } from "../helpers.js";

async function inspectProviderSurface(clientName: string) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createServer(testConfig());
  const client = new Client({
    name: clientName,
    version: "compatibility-test",
  });
  try {
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    const [tools, templates, resources, health] = await Promise.all([
      client.listTools(),
      client.listResourceTemplates(),
      client.listResources(),
      client.callTool({ name: "get_repository_info", arguments: {} }),
    ]);
    return {
      tools: tools.tools.map((tool) => ({
        name: tool.name,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      })),
      templates: templates.resourceTemplates.map(
        (template) => template.uriTemplate,
      ),
      resources: resources.resources.map((resource) => resource.uri),
      health: health.structuredContent,
    };
  } finally {
    await Promise.all([client.close(), server.close()]);
  }
}

describe("provider client compatibility", () => {
  it("exposes the same standard MCP surface to Codex and Claude identities", async () => {
    const [codex, claude] = await Promise.all([
      inspectProviderSurface("codex-cli"),
      inspectProviderSurface("claude-code"),
    ]);

    expect(codex).toEqual(claude);
    expect(codex.tools).toHaveLength(23);
    expect(codex.templates).toEqual(
      expect.arrayContaining([
        "nla://bitstream/{uuid}",
        "nla://bitstream/{uuid}/content",
        "nla://item/{uuid}/text",
      ]),
    );
    expect(codex.health).toMatchObject({
      status: "ok",
      profile: "public-read",
      transport: "stdio",
    });
  });
});
