import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BlueOak-1.0.0",
  "ISC",
  "MIT",
  "MPL-2.0",
]);

interface LockPackage {
  license?: unknown;
  link?: unknown;
}

interface PackageLock {
  packages?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function loadPackages(): Record<string, LockPackage> {
  const lockPath = resolve(process.cwd(), "package-lock.json");
  const parsed = JSON.parse(readFileSync(lockPath, "utf8")) as PackageLock;
  if (!isRecord(parsed.packages)) {
    throw new Error("package-lock.json does not contain a packages map");
  }
  return parsed.packages as Record<string, LockPackage>;
}

const failures: string[] = [];
let checked = 0;
for (const [path, dependency] of Object.entries(loadPackages())) {
  if (!path.startsWith("node_modules/") || dependency.link === true) continue;
  checked += 1;
  if (typeof dependency.license !== "string") {
    failures.push(`${path}: missing SPDX license`);
  } else if (!ALLOWED_LICENSES.has(dependency.license)) {
    failures.push(`${path}: disallowed license ${dependency.license}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Dependency license check passed for ${checked} locked packages.\n`,
  );
}
