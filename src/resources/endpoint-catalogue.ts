import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NlaRepository } from "../nla/repository.js";

export function registerEndpointCatalogueResource(
  server: McpServer,
  repository: NlaRepository,
): void {
  server.registerResource(
    "nla-api-endpoints",
    "nla://api/endpoints",
    {
      title: "NLA API endpoint catalogue",
      description:
        "Validated coverage matrix for all relations advertised by the NLA DSpace API root.",
      mimeType: "application/json",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(repository.getApiCapabilities(true)),
        },
      ],
    }),
  );
}
