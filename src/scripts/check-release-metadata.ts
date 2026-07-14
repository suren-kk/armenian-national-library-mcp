#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { releaseMetadataIssues } from "../release/metadata.js";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

function main(): void {
  const root = process.cwd();
  const issues = releaseMetadataIssues({
    packageManifest: readJson(resolve(root, "package.json")),
    lockManifest: readJson(resolve(root, "package-lock.json")),
    changelog: readFileSync(resolve(root, "CHANGELOG.md"), "utf8"),
    ...(process.env.RELEASE_TAG
      ? { expectedTag: process.env.RELEASE_TAG }
      : {}),
  });
  if (issues.length > 0) {
    for (const issue of issues) process.stderr.write(`- ${issue}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Release metadata is consistent.\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Release metadata check failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
