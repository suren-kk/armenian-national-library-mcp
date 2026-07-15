import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { NlaRepository } from "../nla/repository.js";
import { apiCapabilitiesInput, rawApiGetInput } from "../schemas/inputs.js";
import { registerEnvelopeTool } from "./tool-registration.js";
import type { Metrics } from "../observability/metrics.js";

export function registerApiTools(
  server: McpServer,
  repository: NlaRepository,
  metrics: Metrics,
): void {
  registerEnvelopeTool(
    server,
    "get_api_capabilities",
    "Describe endpoint coverage, access/risk classifications, semantic tool mappings, and paths approved for controlled raw reads. Use when a semantic tool does not cover an operation. Read-only; set include_endpoints for the full catalogue.",
    apiCapabilitiesInput,
    (args) =>
      Promise.resolve(repository.getApiCapabilities(args.include_endpoints)),
    metrics,
  );
  registerEnvelopeTool(
    server,
    "nla_api_get",
    "Perform a controlled anonymous GET or HEAD against an endpoint approved by the NLA registry. Use only when no semantic tool fits. Accepts API-relative paths, bounded query/pagination, and JSON or plain-text responses; arbitrary URLs, mutation methods, caller headers, traversal, and bitstream content are rejected. Read-only; returned upstream data is untrusted.",
    rawApiGetInput,
    (args, signal) =>
      repository.rawApiGet(
        {
          method: args.method,
          path: args.path,
          query: args.query,
          page: args.page,
          pageSize: args.page_size,
          maxResponseBytes: args.max_response_bytes,
        },
        signal,
      ),
    metrics,
  );
}
