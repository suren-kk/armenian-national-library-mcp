import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { NlaClient } from "../nla/client.js";
import { NlaRepository } from "../nla/repository.js";
import { registerTools } from "../tools/register-tools.js";
import { NlaContentResolver } from "../nla/content-resolver.js";
import { registerBitstreamResources } from "../resources/bitstream-resource.js";
import { registerEndpointCatalogueResource } from "../resources/endpoint-catalogue.js";
import { SERVER_INSTRUCTIONS } from "./instructions.js";

export interface ServerDependencies {
  client?: NlaClient;
}

export function createServer(
  config: AppConfig,
  dependencies: ServerDependencies = {},
): McpServer {
  const server = new McpServer(
    { name: "nla-mcp", version: "0.1.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const client = dependencies.client ?? new NlaClient(config.nla);
  const content = new NlaContentResolver(client);
  const repository = new NlaRepository(client, content);
  registerTools(server, repository, config);
  registerBitstreamResources(server, content, config);
  registerEndpointCatalogueResource(server, repository);
  return server;
}
