import { describe, expect, it } from "vitest";
import { releaseMetadataIssues } from "../../src/release/metadata.js";

function validInput() {
  return {
    packageManifest: {
      name: "armenian-national-library-mcp",
      version: "1.0.0",
      private: true,
      description:
        "Independent, unofficial research MCP integration for the National Library of Armenia public DSpace repository",
      author: { name: "Suren Karapetyan", email: "surenakar@gmail.com" },
      maintainers: [{ name: "Suren Karapetyan", email: "surenakar@gmail.com" }],
      repository: {
        type: "git",
        url: "git+https://github.com/suren-kk/armenian-national-library-mcp.git",
      },
      homepage:
        "https://github.com/suren-kk/armenian-national-library-mcp#readme",
      bugs: {
        url: "https://github.com/suren-kk/armenian-national-library-mcp/issues",
      },
      keywords: ["mcp", "dspace"],
      license: "MIT",
      bin: { "armenian-national-library-mcp": "dist/index.js" },
      files: [
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
      ],
    },
    lockManifest: {
      name: "armenian-national-library-mcp",
      version: "1.0.0",
      packages: {
        "": { name: "armenian-national-library-mcp", version: "1.0.0" },
      },
    },
    changelog: "# Changelog\n\n## [1.0.0] - 2026-07-14\n",
  };
}

describe("release metadata", () => {
  it("accepts synchronized stable metadata", () => {
    expect(releaseMetadataIssues(validInput())).toEqual([]);
  });

  it("rejects mismatched tags and private release attempts", () => {
    const input = validInput();
    expect(
      releaseMetadataIssues({
        ...input,
        packageManifest: { ...input.packageManifest, private: true },
        expectedTag: "v1.0.1",
      }),
    ).toEqual(
      expect.arrayContaining([
        "package.json must not be private for a public release; configure the personal npm scope first",
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
        "private package.json name must be armenian-national-library-mcp",
        "package.json files must include README.md",
        "package.json files must include CHANGELOG.md",
        "package.json files must include config/endpoint-matrix.yaml",
        "package.json files must include SECURITY.md",
      ]),
    );
  });

  it("rejects removal of accountable maintainer metadata", () => {
    const input = validInput();
    expect(
      releaseMetadataIssues({
        ...input,
        packageManifest: {
          ...input.packageManifest,
          maintainers: [],
        },
      }),
    ).toContain(
      "package.json maintainers must include Suren Karapetyan and the project contact",
    );
  });

  it("accepts a publication-ready personal scope and canonical metadata", () => {
    const input = validInput();
    expect(
      releaseMetadataIssues({
        ...input,
        packageManifest: {
          ...input.packageManifest,
          name: "@researcher/armenian-national-library-mcp",
          private: false,
          publishConfig: { access: "public" },
          repository: {
            type: "git",
            url: "git+https://github.com/researcher/armenian-national-library-mcp.git",
          },
          homepage:
            "https://github.com/researcher/armenian-national-library-mcp#readme",
          bugs: {
            url: "https://github.com/researcher/armenian-national-library-mcp/issues",
          },
        },
        lockManifest: {
          ...input.lockManifest,
          name: "@researcher/armenian-national-library-mcp",
          packages: {
            "": {
              name: "@researcher/armenian-national-library-mcp",
              version: "1.0.0",
            },
          },
        },
      }),
    ).toEqual([]);
  });
});
