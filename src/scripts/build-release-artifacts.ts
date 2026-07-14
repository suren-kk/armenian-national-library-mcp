#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { digestArtifacts, formatSha256Sums } from "../release/artifacts.js";

interface PackageManifest {
  name: string;
  version: string;
}

interface PackedPackage {
  filename: string;
}

function run(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr.trim()}`,
    );
  }
  return result.stdout;
}

function readPackageManifest(): PackageManifest {
  const value = JSON.parse(
    readFileSync("package.json", "utf8"),
  ) as Partial<PackageManifest>;
  if (typeof value.name !== "string" || typeof value.version !== "string") {
    throw new Error("package.json is missing name or version");
  }
  return { name: value.name, version: value.version };
}

function main(): void {
  const outputDirectory = resolve(process.cwd(), process.argv[2] ?? "release");
  const dirtyFiles = run("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]).trim();
  if (dirtyFiles) {
    throw new Error(
      "Release artifacts require a clean worktree so the npm and source archives use the same revision",
    );
  }
  mkdirSync(outputDirectory, { recursive: true });
  const existing = readdirSync(outputDirectory);
  if (existing.length > 0) {
    throw new Error(
      `Release output directory must be empty: ${outputDirectory}`,
    );
  }

  const packageManifest = readPackageManifest();
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", outputDirectory]),
  ) as PackedPackage[];
  const packageFilename = packed[0]?.filename;
  if (!packageFilename) throw new Error("npm pack did not report an artifact");

  const sbomFilename = `nla-research-mcp-${packageManifest.version}.cdx.json`;
  writeFileSync(
    resolve(outputDirectory, sbomFilename),
    run("npm", [
      "sbom",
      "--package-lock-only",
      "--omit=dev",
      "--sbom-format=cyclonedx",
      "--sbom-type=application",
    ]),
  );

  const sourceFilename = `nla-research-mcp-${packageManifest.version}-source.tar.gz`;
  run("git", [
    "archive",
    "--format=tar.gz",
    `--prefix=nla-research-mcp-${packageManifest.version}/`,
    `--output=${resolve(outputDirectory, sourceFilename)}`,
    "HEAD",
  ]);

  const sourceRevision = run("git", ["rev-parse", "HEAD"]).trim();
  const artifactFilenames = [packageFilename, sbomFilename, sourceFilename];
  const artifacts = digestArtifacts(outputDirectory, artifactFilenames);
  const manifestFilename = "release-manifest.json";
  writeFileSync(
    resolve(outputDirectory, manifestFilename),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        package: packageManifest.name,
        version: packageManifest.version,
        sourceRevision,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
  const checksummedArtifacts = digestArtifacts(outputDirectory, [
    ...artifactFilenames,
    manifestFilename,
  ]);
  writeFileSync(
    resolve(outputDirectory, "SHA256SUMS"),
    formatSha256Sums(checksummedArtifacts),
  );
  process.stdout.write(
    `Created ${checksummedArtifacts.length} release artifacts in ${outputDirectory}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `Release artifact build failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
