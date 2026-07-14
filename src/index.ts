#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { Logger } from "./observability/logger.js";
import { createServer } from "./server/create-server.js";
import { startStdio } from "./transports/stdio.js";

const logger = new Logger("startup");

function loadLocalEnvironment(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const config = loadConfig();
  if (config.mcp.transport !== "stdio") {
    throw new Error(
      "Streamable HTTP is not implemented; set MCP_TRANSPORT=stdio",
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
