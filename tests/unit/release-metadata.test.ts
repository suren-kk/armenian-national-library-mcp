import { describe, expect, it } from "vitest";
import { releaseMetadataIssues } from "../../src/release/metadata.js";

function validInput() {
  return {
    packageManifest: {
      name: "@nla-am/nla-mcp",
      version: "1.0.0",
      license: "MIT",
      publishConfig: { access: "public" },
      bin: { "nla-mcp": "dist/index.js" },
      files: [
        "dist",
        "config",
        "docs",
        "evals",
        "README.md",
        "CHANGELOG.md",
        "SECURITY.md",
        "LICENSE",
      ],
    },
    lockManifest: {
      name: "@nla-am/nla-mcp",
      version: "1.0.0",
      packages: {
        "": { name: "@nla-am/nla-mcp", version: "1.0.0" },
      },
    },
    changelog: "# Changelog\n\n## [1.0.0] - 2026-07-14\n",
  };
}

describe("release metadata", () => {
  it("accepts synchronized stable metadata", () => {
    expect(releaseMetadataIssues(validInput())).toEqual([]);
  });

  it("rejects mismatched tags and private packages", () => {
    const input = validInput();
    expect(
      releaseMetadataIssues({
        ...input,
        packageManifest: { ...input.packageManifest, private: true },
        expectedTag: "v1.0.1",
      }),
    ).toEqual(
      expect.arrayContaining([
        "package.json must not be private for a public release",
        "release tag v1.0.1 does not match package version v1.0.0",
      ]),
    );
  });

  it("rejects package identity and documentation drift", () => {
    const input = validInput();
    expect(
      releaseMetadataIssues({
        ...input,
        packageManifest: {
          ...input.packageManifest,
          name: "unrelated-package",
          files: ["dist"],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        "package.json name must be @nla-am/nla-mcp",
        "package.json files must include README.md",
        "package.json files must include CHANGELOG.md",
        "package.json files must include SECURITY.md",
      ]),
    );
  });
});
