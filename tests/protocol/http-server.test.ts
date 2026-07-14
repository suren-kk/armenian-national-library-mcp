import { once } from "node:events";
import {
  createServer as createNodeServer,
  request as nodeRequest,
  type Server as NodeHttpServer,
} from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../../src/config.js";
import {
  createHttpApplication,
  startStreamableHttp,
  type HttpApplicationDependencies,
} from "../../src/transports/streamable-http.js";
import { testConfig } from "../helpers.js";

interface TestHttpServer {
  baseUrl: string;
  close(): Promise<void>;
}

async function startTestServer(
  config: AppConfig,
  dependencies: HttpApplicationDependencies = {},
): Promise<TestHttpServer> {
  const application = createHttpApplication(config, dependencies);
  const server = createNodeServer(application.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await application.close();
      await closeNodeServer(server);
    },
  };
}

async function closeNodeServer(server: NodeHttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function requestStatus(
  url: string,
  headers: Readonly<Record<string, string>>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = nodeRequest(url, { headers }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode ?? 0));
    });
    request.once("error", reject);
    request.end();
  });
}

function httpConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return testConfig({
    MCP_TRANSPORT: "http",
    MCP_ALLOWED_HOSTS: "127.0.0.1",
    MCP_ALLOWED_ORIGINS: "https://client.example",
    MCP_RATE_LIMIT_PER_CLIENT: "30",
    MCP_RATE_LIMIT_GLOBAL: "100",
    ...overrides,
  });
}

describe("Streamable HTTP server", () => {
  const closeables: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    for (const value of closeables.splice(0).reverse()) await value.close();
  });

  it("serves health and readiness outside the MCP endpoint", async () => {
    const readinessCheck = vi.fn(() => Promise.resolve());
    const runtime = await startTestServer(httpConfig(), { readinessCheck });
    closeables.push(runtime);

    const health = await fetch(`${runtime.baseUrl}/healthz`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({
      status: "ok",
      service: "nla-research-mcp",
    });
    const readiness = await fetch(`${runtime.baseUrl}/readyz`);
    expect(readiness.status).toBe(200);
    await expect(readiness.json()).resolves.toEqual({
      status: "ready",
      upstream: "reachable",
    });
    expect(readinessCheck).toHaveBeenCalledTimes(1);
  });

  it("starts and stops the configured HTTP runtime", async () => {
    const config = httpConfig();
    const runtime = await startStreamableHttp(
      { ...config, mcp: { ...config.mcp, port: 0 } },
      { readinessCheck: () => Promise.resolve() },
    );
    closeables.push(runtime);

    expect(runtime.port).toBeGreaterThan(0);
    expect(runtime.mcpUrl).toBe(`http://127.0.0.1:${runtime.port}/mcp`);
    const healthUrl = new URL("/healthz", runtime.mcpUrl);
    expect((await fetch(healthUrl)).status).toBe(200);
  });

  it("returns unavailable readiness when the upstream check fails", async () => {
    const runtime = await startTestServer(httpConfig(), {
      readinessCheck: () => Promise.reject(new Error("offline")),
    });
    closeables.push(runtime);

    const response = await fetch(`${runtime.baseUrl}/readyz`);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: "not_ready",
      upstream: "unavailable",
    });
  });

  it("supports independent stateless MCP clients", async () => {
    const runtime = await startTestServer(httpConfig(), {
      readinessCheck: () => Promise.resolve(),
    });
    closeables.push(runtime);
    const clients = ["client-a", "client-b"].map(
      (name) => new Client({ name, version: "1.0.0" }),
    );
    const transports = clients.map(
      () =>
        new StreamableHTTPClientTransport(new URL(`${runtime.baseUrl}/mcp`)),
    );
    closeables.push(...clients);

    await Promise.all(
      clients.map((client, index) =>
        client.connect(
          transports[index] as unknown as Parameters<Client["connect"]>[0],
        ),
      ),
    );
    expect(
      transports.every((transport) => transport.sessionId === undefined),
    ).toBe(true);
    const toolLists = await Promise.all(
      clients.map((client) => client.listTools()),
    );
    for (const tools of toolLists) {
      expect(tools.tools).toHaveLength(23);
      expect(tools.tools.map((tool) => tool.name)).toContain(
        "get_api_capabilities",
      );
    }
    const toolResults = await Promise.all(
      clients.map((client) =>
        client.callTool({
          name: "get_api_capabilities",
          arguments: { include_endpoints: false },
        }),
      ),
    );
    expect(toolResults.every((result) => result.isError !== true)).toBe(true);
  });

  it("rejects invalid Host and Origin headers and supports CORS preflight", async () => {
    const runtime = await startTestServer(httpConfig());
    closeables.push(runtime);

    const invalidHostStatus = await requestStatus(
      `${runtime.baseUrl}/healthz`,
      { Host: "evil.example" },
    );
    expect(invalidHostStatus).toBe(403);

    const invalidOrigin = await fetch(`${runtime.baseUrl}/healthz`, {
      headers: { Origin: "https://evil.example" },
    });
    expect(invalidOrigin.status).toBe(403);

    const preflight = await fetch(`${runtime.baseUrl}/mcp`, {
      method: "OPTIONS",
      headers: { Origin: "https://client.example" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    expect(preflight.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  it("enforces request size, encoding, JSON, and rate limits", async () => {
    const runtime = await startTestServer(
      httpConfig({
        MCP_MAX_REQUEST_BYTES: "1024",
        MCP_RATE_LIMIT_PER_CLIENT: "3",
      }),
    );
    closeables.push(runtime);

    const oversized = await fetch(`${runtime.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(1_024) }),
    });
    expect(oversized.status).toBe(413);

    const compressed = await fetch(`${runtime.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: "{}",
    });
    expect(compressed.status).toBe(415);

    const malformed = await fetch(`${runtime.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(malformed.status).toBe(400);

    const limited = await fetch(`${runtime.baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).not.toBeNull();
  });
});
