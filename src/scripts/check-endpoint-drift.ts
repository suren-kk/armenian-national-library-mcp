#!/usr/bin/env node
import { loadConfig } from "../config.js";
import { NlaClient } from "../nla/client.js";
import {
  checkEndpointRegistryDrift,
  loadEndpointRegistry,
} from "../nla/endpoint-registry.js";

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
  const report = await checkEndpointRegistryDrift(
    new NlaClient(config.nla),
    loadEndpointRegistry(),
    { checkAccess: process.env.NLA_DRIFT_CHECK_ACCESS === "true" },
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.hasDrift) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      code: "NLA_DRIFT_CHECK_FAILED",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 2;
});
