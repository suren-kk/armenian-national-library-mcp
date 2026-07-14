# Release guide

Releases use stable semantic versions and publish the same provider-neutral server through npm, a container image, and a checksummed source release. The automation targets GitHub Actions, npm, GitHub Container Registry, and GitHub Releases.

## One-time repository setup

1. Configure this checkout with the intended GitHub remote and enable Actions and GitHub Packages.
2. Confirm that the release owner controls the `@nla-am` npm scope and that the package name is correct.
3. Add an npm automation token with publish access as the `NPM_TOKEN` Actions secret. Protect the release environment and require maintainer approval if the repository policy supports it.
4. Enable GitHub private vulnerability reporting and set the repository issue/support contacts.
5. Keep the default `GITHUB_TOKEN` package and release permissions available to the tag workflow.

The workflow derives its image destination from the repository name: `ghcr.io/<owner>/<repository>`. No registry, repository, or hosted MCP destination is hard-coded in application behavior.

## Version policy

- Patch: backward-compatible fixes, documentation, and internal hardening.
- Minor: backward-compatible tools, optional fields, and capabilities.
- Major: removed/renamed tools, changed required inputs, incompatible output/schema changes, or raised runtime requirements that break supported installations.

Before tagging, update `package.json`, the root versions in `package-lock.json`, `src/version.ts`, and `CHANGELOG.md`. The release check rejects mismatches, non-stable versions, and a tag that is not exactly `v<version>`.

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

Create a signed annotated tag and push it only after artifact review:

```bash
git tag -s v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

The tag workflow re-runs all deterministic gates, validates the tag, publishes the public npm package with provenance, builds and pushes the versioned container, and creates the GitHub release with all checksummed artifacts. It tags a stable image as `<version>`, `<major>.<minor>`, `<major>`, and `latest`.

Publishing is intentionally not available from an arbitrary untagged branch. Never reuse or move a published version tag. If a channel succeeds and a later channel fails, keep the immutable artifacts and rerun the tag workflow: it skips an existing npm version only when its SHA-512 integrity matches the rebuilt tarball, safely replaces release assets, and idempotently pushes container tags. An integrity mismatch stops the workflow; publish a reviewed patch version instead of overwriting an npm version.

## Verify a release

From a clean machine with Node.js 24 or newer:

```bash
npm view @nla-am/nla-mcp@1.0.0 version dist.integrity
npx -y @nla-am/nla-mcp@1.0.0
```

Verify `release/SHA256SUMS` against downloaded release assets, inspect the image's OCI `version`, `revision`, and `source` labels, and run the new-user flow in [README.md](../README.md) with both Codex and Claude before announcing the release.
