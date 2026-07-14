#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { Logger } from "./observability/logger.js";
import { createServer } from "./server/create-server.js";
import { startStdio } from "./transports/stdio.js";
import { startStreamableHttp } from "./transports/streamable-http.js";

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
  let closeServer: () => Promise<void>;
  if (config.mcp.transport === "stdio") {
    const server = createServer(config);
    await startStdio(server);
    closeServer = () => server.close();
    logger.info("server_started", {
      transport: "stdio",
      profile: "public-read",
    });
  } else {
    const runtime = await startStreamableHttp(config);
    closeServer = () => runtime.close();
    logger.info("server_started", {
      transport: "http",
      profile: "public-read",
      host: runtime.host,
      port: runtime.port,
      mcpUrl: runtime.mcpUrl,
      healthPath: "/healthz",
      readinessPath: "/readyz",
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutdown", { signal });
    await closeServer();
    process.exitCode = 0;
  };
  const handleSignal = (signal: string) => {
    void shutdown(signal).catch((error: unknown) => {
      logger.error("shutdown_failed", {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
}

main().catch((error: unknown) => {
  logger.error("startup_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
