# Release guide

Releases use stable semantic versions and publish the same independent, unofficial server through `@suren-kk/armenian-national-library-mcp`, `ghcr.io/suren-kk/armenian-national-library-mcp`, and a checksummed source release from the canonical GitHub repository. The maintainer has chosen this independent-release posture with the disclosures and safeguards in [Data and Content Rights](../DATA_AND_CONTENT_RIGHTS.md); this owner decision is not NLA authorization or legal advice.

## One-time repository setup

1. Use the canonical `suren-kk/armenian-national-library-mcp` GitHub repository and enable Actions and GitHub Packages.
2. Use the public `@suren-kk/armenian-national-library-mcp` npm identity and keep its exact repository, homepage, issues, lockfile, and release-test metadata synchronized.
3. Perform the first public package creation interactively with npm 2FA. Then configure npm Trusted Publishing for GitHub owner `suren-kk`, repository `armenian-national-library-mcp`, and workflow `release.yml`. The workflow intentionally has no long-lived `NPM_TOKEN` fallback.
4. Keep `id-token: write`, use GitHub-hosted runners, and configure a protected release environment when available.
5. Enable GitHub private vulnerability reporting, push protection/secret scanning, CodeQL code scanning, Dependabot alerts/security updates, and required branch checks. Set the public support, privacy, security, and rights contacts to the policies in this repository.
6. Keep the default `GITHUB_TOKEN` package and release permissions available to the tag workflow.

The workflow derives its image destination from the repository name: `ghcr.io/<owner>/<repository>`. No registry, repository, or hosted MCP destination is hard-coded in application behavior.

## Version policy

- Patch: backward-compatible fixes, documentation, and internal hardening.
- Minor: backward-compatible tools, optional fields, and capabilities.
- Major: removed/renamed tools, changed required inputs, incompatible output/schema changes, or raised runtime requirements that break supported installations.

Before tagging, update `package.json`, the root versions in `package-lock.json`, `src/version.ts`, and `CHANGELOG.md`. Confirm `publishConfig.access` remains `public` and that the npm scope and trusted publisher are ready. The release check rejects a private tag build, mismatches, non-stable versions, and a tag that is not exactly `v<version>`.

## Prepare and publish

Run the complete local gate and inspect the package before committing the release:

```bash
npm ci --ignore-scripts
npm run ci
npm pack --dry-run
```

Commit the reviewed version and changelog, confirm the worktree is clean, and then reproduce the artifacts:

```bash
npm run release:artifacts
(cd release && sha256sum --check SHA256SUMS) # Linux
(cd release && shasum -a 256 -c SHA256SUMS)  # macOS
```

The `release/` directory must be empty before artifact generation. It contains the npm tarball, CycloneDX SBOM, source archive, release manifest, and SHA-256 checksums. The source revision in the manifest is the commit being released. Artifact generation refuses a dirty worktree so the npm and source archives cannot silently represent different source states.

Complete and retain the [neutral-client and hosted acceptance gate](client-acceptance.md) on the same clean candidate revision. Deterministic protocol tests are necessary but do not replace the Codex, Claude, and MCP Inspector evidence required before public/shared deployment.

Create a signed annotated tag and push it only after artifact review:

```bash
git tag -s v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The tag workflow re-runs all deterministic gates, validates the tag, scans the exact built container, adds the SARIF report to the checksummed and attested artifacts, publishes the public npm package with provenance, builds and pushes the versioned container, and creates the GitHub release. It tags a stable image as `<version>`, `<major>.<minor>`, `<major>`, and `latest`.

Publishing is intentionally not available from an arbitrary untagged branch. Never reuse or move a published version tag. If a channel succeeds and a later channel fails, keep the immutable artifacts and rerun the tag workflow: it skips an existing npm version only when its SHA-512 integrity matches the rebuilt tarball, safely replaces release assets, and idempotently pushes container tags. An integrity mismatch stops the workflow; publish a reviewed patch version instead of overwriting an npm version.

## Verify a release

From a clean machine with Node.js 24 or newer:

```bash
npm view @suren-kk/armenian-national-library-mcp@<version> version dist.integrity
npx -y @suren-kk/armenian-national-library-mcp@<version>
```

Verify `release/SHA256SUMS` against downloaded release assets, then verify GitHub's signed artifact and container attestations with `gh attestation verify <artifact> --repo suren-kk/armenian-national-library-mcp` and `gh attestation verify oci://ghcr.io/suren-kk/armenian-national-library-mcp@sha256:<digest> --repo suren-kk/armenian-national-library-mcp`. Inspect the image's OCI `version`, `revision`, and `source` labels, and run the new-user flow in [README.md](../README.md) with both Codex and Claude before announcing the release.
