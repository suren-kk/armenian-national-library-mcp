import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export async function startStdio(server: McpServer): Promise<void> {
  await server.connect(new StdioServerTransport());
}
