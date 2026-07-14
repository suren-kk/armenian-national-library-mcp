import { SERVER_VERSION } from "../version.js";

export interface ReleaseMetadataInput {
  packageManifest: Record<string, unknown>;
  lockManifest: Record<string, unknown>;
  changelog: string;
  expectedTag?: string;
}

const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function objectValue(
  value: unknown,
): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function releaseMetadataIssues({
  packageManifest,
  lockManifest,
  changelog,
  expectedTag,
}: ReleaseMetadataInput): string[] {
  const issues: string[] = [];
  const version = packageManifest.version;

  if (typeof version !== "string" || !stableSemver.test(version)) {
    issues.push("package.json version must be a stable semantic version");
    return issues;
  }
  if (packageManifest.name !== "@nla-am/nla-mcp") {
    issues.push("package.json name must be @nla-am/nla-mcp");
  }
  if (version !== SERVER_VERSION) {
    issues.push(
      `package.json version ${version} does not match server version ${SERVER_VERSION}`,
    );
  }
  if (lockManifest.version !== version) {
    issues.push("package-lock.json version does not match package.json");
  }
  if (lockManifest.name !== packageManifest.name) {
    issues.push("package-lock.json name does not match package.json");
  }
  const rootLockPackage = objectValue(
    objectValue(lockManifest.packages)?.[""],
  );
  if (rootLockPackage?.version !== version) {
    issues.push("package-lock.json root package version does not match package.json");
  }
  if (rootLockPackage?.name !== packageManifest.name) {
    issues.push("package-lock.json root package name does not match package.json");
  }
  if (packageManifest.private === true) {
    issues.push("package.json must not be private for a public release");
  }
  if (packageManifest.license !== "MIT") {
    issues.push("package.json license must match LICENSE (MIT)");
  }
  const publishConfig = objectValue(packageManifest.publishConfig);
  if (publishConfig?.access !== "public") {
    issues.push("publishConfig.access must be public for the scoped npm package");
  }
  const bin = objectValue(packageManifest.bin);
  if (bin?.["nla-mcp"] !== "dist/index.js") {
    issues.push("package.json must publish the nla-mcp CLI binary");
  }
  const publishedFiles = Array.isArray(packageManifest.files)
    ? new Set(packageManifest.files)
    : new Set<unknown>();
  for (const requiredFile of [
    "dist",
    "config",
    "docs",
    "evals",
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "LICENSE",
  ]) {
    if (!publishedFiles.has(requiredFile)) {
      issues.push(`package.json files must include ${requiredFile}`);
    }
  }
  const changelogHeading = new RegExp(
    `^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
    "m",
  );
  if (!changelogHeading.test(changelog)) {
    issues.push(`CHANGELOG.md is missing a dated ${version} release entry`);
  }
  if (expectedTag !== undefined && expectedTag !== `v${version}`) {
    issues.push(
      `release tag ${expectedTag} does not match package version v${version}`,
    );
  }
  return issues;
}
