import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import type { NlaRepository } from "../nla/repository.js";
import { capabilitySummary } from "../server/capabilities.js";
import { healthOutput } from "../schemas/outputs.js";
import { registerApiTools } from "./register-api-tools.js";
import { registerContentTools } from "./register-content-tools.js";
import { registerDiscoveryTools } from "./register-discovery-tools.js";
import {
  READ_ONLY,
  successResult,
  trustedResourceLink,
} from "./tool-registration.js";

export { trustedResourceLink };

export function registerTools(
  server: McpServer,
  repository: NlaRepository,
  config: AppConfig,
): void {
  server.registerTool(
    "get_repository_info",
    {
      description:
        "Use first to inspect local server configuration and advertised public-read capabilities. This does not contact NLA; HTTP deployments expose upstream readiness separately at /readyz. Read-only; returns no untrusted catalogue text.",
      outputSchema: healthOutput.shape,
      annotations: READ_ONLY,
    },
    () => successResult(healthOutput.parse(capabilitySummary(config))),
  );

  registerDiscoveryTools(server, repository);
  registerContentTools(server, repository);
  registerApiTools(server, repository);
}
