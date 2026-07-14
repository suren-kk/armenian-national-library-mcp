import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

export interface ArtifactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

export function digestArtifact(path: string): ArtifactDigest {
  const content = readFileSync(path);
  return {
    file: basename(path),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}

export function digestArtifacts(
  directory: string,
  filenames: readonly string[],
): ArtifactDigest[] {
  return [...filenames]
    .sort()
    .map((filename) => digestArtifact(resolve(directory, filename)));
}

export function formatSha256Sums(
  artifacts: readonly ArtifactDigest[],
): string {
  return `${artifacts.map(({ file, sha256 }) => `${sha256}  ${file}`).join("\n")}\n`;
}
