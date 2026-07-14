import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  digestArtifacts,
  formatSha256Sums,
} from "../../src/release/artifacts.js";

describe("release artifact checksums", () => {
  it("sorts artifacts and emits sha256sum-compatible output", () => {
    const directory = mkdtempSync(join(tmpdir(), "nla-release-"));
    writeFileSync(join(directory, "b.txt"), "beta\n");
    writeFileSync(join(directory, "a.txt"), "alpha\n");

    const artifacts = digestArtifacts(directory, ["b.txt", "a.txt"]);
    expect(artifacts.map(({ file }) => file)).toEqual(["a.txt", "b.txt"]);
    expect(formatSha256Sums(artifacts)).toMatch(
      /^[a-f0-9]{64} {2}a\.txt\n[a-f0-9]{64} {2}b\.txt\n$/,
    );
  });
});
