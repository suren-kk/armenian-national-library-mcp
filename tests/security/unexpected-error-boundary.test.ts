import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NlaClient } from "../../src/nla/client.js";
import { createServer } from "../../src/server/create-server.js";
import { testConfig } from "../helpers.js";

describe("unexpected tool error boundary", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(closeables.splice(0).map((value) => value.close()));
  });

  it("returns a stable generic error without internal details", async () => {
    const secret =
      "/private/app/config.json token=super-secret https://internal.example";
    const config = testConfig();
    const fakeClient = {
      config: config.nla,
      getJson: () => Promise.reject(new Error(secret)),
    } as unknown as NlaClient;
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const server = createServer(config, { client: fakeClient });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "security-test", version: "1.0.0" });
    closeables.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);

    const result = await client.callTool({
      name: "search_catalog",
      arguments: { query: "Armenia" },
    });
    const serialized = JSON.stringify(result);

    expect(result.isError).toBe(true);
    expect(serialized).toContain("NLA_INTERNAL_ERROR");
    expect(serialized).toContain("correlationId");
    expect(serialized).not.toContain(secret);
    expect(stderr.mock.calls.flat().join(" ")).not.toContain(secret);
  });
});
