#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadConfig } from "../config.js";
import {
  assertEvalCaseId,
  createProviderEvalRepository,
} from "../evals/provider-fixture.js";
import { SERVER_INSTRUCTIONS } from "../server/instructions.js";
import { startStdio } from "../transports/stdio.js";
import { registerTools } from "../tools/register-tools.js";
import { SERVER_NAME, SERVER_VERSION } from "../version.js";

async function main(): Promise<void> {
  const caseId = assertEvalCaseId(process.env.NLA_EVAL_CASE_ID);
  const config = loadConfig({
    ...process.env,
    MCP_TRANSPORT: "stdio",
    NLA_METRICS_MODE: "none",
  });
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerTools(server, createProviderEvalRepository(caseId), config);
  await startStdio(server);

  const close = () => {
    void server.close().finally(() => {
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
