import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NlaClient } from "../../src/nla/client.js";
import { createServer } from "../../src/server/create-server.js";
import { requestUrl, testConfig } from "../helpers.js";

const bitstreamUuid = "4ead233d-ef4d-4db6-b6f4-a5bb3783abf0";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/hal+json" },
  });
}

describe("MCP content resources", () => {
  const connected: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(connected.splice(0).map((value) => value.close()));
  });

  it("lists resource templates and reads bounded text content", async () => {
    // Async keeps this test double assignable to the platform fetch signature.
    // eslint-disable-next-line @typescript-eslint/require-await
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = requestUrl(input);
      const base = `/core/bitstreams/${bitstreamUuid}`;
      if (url.pathname.endsWith(base)) {
        return json({
          id: bitstreamUuid,
          uuid: bitstreamUuid,
          name: "document.txt",
          bundleName: "TEXT",
          sizeBytes: 5,
          type: "bitstream",
          metadata: {},
          _links: { self: { href: url.toString() } },
        });
      }
      if (url.pathname.endsWith(`${base}/format`)) {
        return json({
          id: 6,
          shortDescription: "Text",
          description: "Plain text",
          mimetype: "text/plain",
          supportLevel: "KNOWN",
          internal: false,
          extensions: ["txt"],
          type: "bitstreamformat",
        });
      }
      if (url.pathname.endsWith(`${base}/accessStatus`)) {
        return json({
          status: "open.access",
          embargoDate: null,
          type: "accessStatus",
        });
      }
      if (url.pathname.endsWith(`${base}/content`)) {
        return new Response("hello", {
          headers: { "content-type": "text/plain" },
        });
      }
      throw new Error(`Unexpected URL ${url.toString()}`);
    });
    const config = testConfig();
    const server = createServer(config, {
      client: new NlaClient(config.nla, fetchMock),
    });
    const client = new Client({ name: "resource-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    connected.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const templates = await client.listResourceTemplates();
    expect(
      templates.resourceTemplates.map((template) => template.uriTemplate),
    ).toEqual(
      expect.arrayContaining([
        "nla://bitstream/{uuid}",
        "nla://bitstream/{uuid}/content",
        "nla://item/{uuid}/text",
      ]),
    );
    const resources = await client.listResources();
    expect(resources.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "nla://api/endpoints" }),
      ]),
    );
    const catalogue = await client.readResource({ uri: "nla://api/endpoints" });
    const catalogueContent = catalogue.contents[0];
    expect(catalogueContent && "text" in catalogueContent).toBe(true);
    const catalogueText =
      catalogueContent && "text" in catalogueContent
        ? catalogueContent.text
        : "{}";
    expect(JSON.parse(catalogueText)).toMatchObject({
      data: { summary: { totalRelations: 80 } },
    });
    const result = await client.readResource({
      uri: `nla://bitstream/${bitstreamUuid}/content`,
    });
    expect(result.contents).toEqual([
      {
        uri: `nla://bitstream/${bitstreamUuid}/content`,
        mimeType: "text/plain",
        text: "hello",
      },
    ]);
  });
});
