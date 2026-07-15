import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NlaClient } from "../../src/nla/client.js";
import { NlaError } from "../../src/nla/errors.js";
import { createServer } from "../../src/server/create-server.js";
import { testConfig } from "../helpers.js";

describe("tool observability", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(closeables.splice(0).map((value) => value.close()));
  });

  async function connect(clientImplementation?: NlaClient) {
    const config = testConfig({ NLA_METRICS_MODE: "log" });
    const server = createServer(config, {
      ...(clientImplementation ? { client: clientImplementation } : {}),
    });
    const client = new Client({ name: "observability-test", version: "1.0.0" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    closeables.push(client, server);
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return { client, config };
  }

  it("records content-free success duration, result pressure, and metrics", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const { client } = await connect();

    await client.callTool({ name: "get_repository_info" });

    const records = write.mock.calls.map(
      ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        component: "mcp-tools",
        message: "tool_call_completed",
        tool: "get_repository_info",
        resultCount: null,
        truncated: null,
      }),
    );
    expect(records).toContainEqual(
      expect.objectContaining({
        component: "mcp-tool-metrics",
        message: "metric",
        name: "nla_tool_calls_total",
        labels: { tool: "get_repository_info", outcome: "success" },
      }),
    );
  });

  it("records only a safe error category and never the caller query", async () => {
    const privateQuery = "private-person-research-query";
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const config = testConfig({ NLA_METRICS_MODE: "log" });
    const fakeClient = {
      config: config.nla,
      getJson: () =>
        Promise.reject(
          new NlaError("NLA_NOT_FOUND", "Sanitized fixture was not found"),
        ),
    } as unknown as NlaClient;
    const { client } = await connect(fakeClient);

    await client.callTool({
      name: "search_catalog",
      arguments: { query: privateQuery },
    });

    const output = write.mock.calls.map(([line]) => String(line)).join("");
    expect(output).toContain('"message":"tool_call_failed"');
    expect(output).toContain('"tool":"search_catalog"');
    expect(output).toContain('"errorCode":"NLA_NOT_FOUND"');
    expect(output).not.toContain(privateQuery);
  });
});
