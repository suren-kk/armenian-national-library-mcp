#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = process.env.NLA_DRIFT_REPORT_PATH;
  if (reportPath) {
    const absolutePath = resolve(reportPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, serialized);
  }
  process.stdout.write(serialized);
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
