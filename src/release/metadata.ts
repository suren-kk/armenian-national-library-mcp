import { SERVER_VERSION } from "../version.js";

export interface ReleaseMetadataInput {
  packageManifest: Record<string, unknown>;
  lockManifest: Record<string, unknown>;
  changelog: string;
  expectedTag?: string;
}

const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const publicPackageName = /^@[a-z0-9][a-z0-9._-]*\/nla-research-mcp$/;
const provisionalPackageName = "nla-research-mcp";
const expectedDescription =
  "Independent, unofficial research MCP integration for the National Library of Armenia public DSpace repository";

function objectValue(value: unknown): Record<string, unknown> | undefined {
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
  if (
    packageManifest.private === true &&
    packageManifest.name !== provisionalPackageName
  ) {
    issues.push(`private package.json name must be ${provisionalPackageName}`);
  }
  if (
    packageManifest.private !== true &&
    (typeof packageManifest.name !== "string" ||
      !publicPackageName.test(packageManifest.name))
  ) {
    issues.push(
      "public package.json name must use a personal scope: @<scope>/nla-research-mcp",
    );
  }
  if (packageManifest.description !== expectedDescription) {
    issues.push(
      "package.json description must identify the project as independent and unofficial",
    );
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
  const rootLockPackage = objectValue(objectValue(lockManifest.packages)?.[""]);
  if (rootLockPackage?.version !== version) {
    issues.push(
      "package-lock.json root package version does not match package.json",
    );
  }
  if (rootLockPackage?.name !== packageManifest.name) {
    issues.push(
      "package-lock.json root package name does not match package.json",
    );
  }
  if (expectedTag !== undefined && packageManifest.private === true) {
    issues.push(
      "package.json must not be private for a public release; configure the personal npm scope first",
    );
  }
  if (packageManifest.license !== "MIT") {
    issues.push("package.json license must match LICENSE (MIT)");
  }
  const author = objectValue(packageManifest.author);
  if (
    author?.name !== "Suren Karapetyan" ||
    author.email !== "surenakar@gmail.com"
  ) {
    issues.push(
      "package.json author and legal contact must identify Suren Karapetyan",
    );
  }
  const publishConfig = objectValue(packageManifest.publishConfig);
  if (packageManifest.private !== true && publishConfig?.access !== "public") {
    issues.push(
      "publishConfig.access must be public when publication is enabled",
    );
  }
  if (packageManifest.private !== true) {
    const repository = objectValue(packageManifest.repository);
    const bugs = objectValue(packageManifest.bugs);
    if (
      repository?.type !== "git" ||
      typeof repository.url !== "string" ||
      !repository.url.includes("github.com/")
    ) {
      issues.push(
        "public package.json must declare the canonical GitHub repository",
      );
    }
    if (
      typeof packageManifest.homepage !== "string" ||
      !packageManifest.homepage.includes("github.com/")
    ) {
      issues.push(
        "public package.json must declare the canonical GitHub homepage",
      );
    }
    if (typeof bugs?.url !== "string" || !bugs.url.includes("github.com/")) {
      issues.push(
        "public package.json must declare the canonical GitHub issue URL",
      );
    }
  }
  const bin = objectValue(packageManifest.bin);
  if (bin?.["nla-research-mcp"] !== "dist/index.js") {
    issues.push("package.json must expose the nla-research-mcp CLI binary");
  }
  const publishedFiles = Array.isArray(packageManifest.files)
    ? new Set(packageManifest.files)
    : new Set<unknown>();
  for (const requiredFile of [
    "dist/**/*.js",
    "config/endpoint-matrix.yaml",
    "README.md",
    "CHANGELOG.md",
    "DATA_AND_CONTENT_RIGHTS.md",
    "PRIVACY.md",
    "SECURITY.md",
    "TAKEDOWN.md",
    "THIRD_PARTY_NOTICES.md",
    "NOTICE",
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
