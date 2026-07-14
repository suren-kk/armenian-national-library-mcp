#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { Logger } from "./observability/logger.js";
import { createServer } from "./server/create-server.js";
import { startStdio } from "./transports/stdio.js";

const logger = new Logger("startup");

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.mcp.transport !== "stdio") {
    throw new Error(
      "Streamable HTTP is planned for Phase 6; set MCP_TRANSPORT=stdio for Phases 1–3",
    );
  }

  const server = createServer(config);
  const shutdown = async (signal: string) => {
    logger.info("shutdown", { signal });
    await server.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await startStdio(server);
  logger.info("server_started", { transport: "stdio", profile: "public-read" });
}

main().catch((error: unknown) => {
  logger.error("startup_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
