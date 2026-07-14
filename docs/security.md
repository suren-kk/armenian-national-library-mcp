# Security model

This document records the focused threat-model review for the public, read-only NLA MCP server. It covers the stdio and stateless Streamable HTTP profiles, the NLA API client, HTTP bearer/proxy boundaries, inline content resources, package dependencies, and the container runtime. Repository administration, full OAuth authorization, local OCR, and writable downloads are outside the current scope.

## Assets and trust boundaries

| Boundary                | Untrusted input                                                           | Protected asset or property                          | Primary controls                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MCP client → server     | Tool arguments, HTTP headers, JSON bodies                                 | Process availability and read-only behavior          | Zod schemas, strict media type, body deadline/limits, route and MCP rates, concurrency bounds, Host/Origin checks        |
| NLA API → server        | HAL links, metadata, highlights, filenames, text, binary bytes, redirects | Network boundary, model context, terminal/log safety | Fixed HTTPS host, base-path checks, redirect validation, byte limits, UTF-8 validation, filename checks, control removal |
| Server → model client   | Catalogue text and document content                                       | Instruction integrity                                | Static server instructions, untrusted-data labels, separate provenance, no evaluation/rendering/execution                |
| Build inputs → artifact | npm packages and container base image                                     | Artifact integrity and reproducibility               | Lockfile, `npm ci --ignore-scripts`, advisory/license checks, SBOM generation, digest-pinned base image                  |
| Container → host        | Compromised Node process                                                  | Host filesystem and kernel                           | Non-root UID, read-only root, all capabilities dropped, no-new-privileges, PID/memory/CPU limits, loopback publishing    |

The only permitted upstream application host is `api.nla.am`, over HTTPS and under `/server/api`. Redirects and non-templated or templated HAL link prefixes are checked against the same boundary before use. NLA catalogue content is data, never configuration or server instructions.

## Threat review

### SSRF and unsafe redirects

An attacker may supply an identifier, raw API path, malicious HAL link, redirect, encoded traversal sequence, userinfo URL, alternate port, or private-network address. The configuration fixes the upstream hostname to `api.nla.am`; URL policy rejects HTTP, credentials, non-default ports, other hosts, paths outside the API root, encoded separators/traversal, and protocol-relative URLs. Every redirect is manually processed, revalidated, and bounded. The raw API tool separately permits only registered read paths and generated query parameters.

### Prompt injection and hostile content

Metadata, highlights, extracted text, and filenames can contain instructions, HTML, scripts, or terminal escape sequences. The server preserves ordinary source text for research fidelity but strips dangerous control characters. Static instructions and tool descriptions never incorporate upstream strings. Extracted text includes `untrustedSourceData: true` provenance, and tool descriptions identify metadata as untrusted. Upstream objects are never generically promoted into MCP resource links, and semantic results omit upstream HAL links. The server does not render HTML, execute links, scripts, macros, archives, or document commands.

### Resource exhaustion and malicious files

Input schemas cap strings, arrays, page sizes, offsets, and raw-query shapes. The HTTP transport requires unambiguous UTF-8 JSON, caps request bytes before parsing, applies a body-read deadline, rejects compression, and bounds active work globally and per client. NLA responses are streamed under per-call byte limits; cached responses are rechecked against the active limit, and the cache has entry and aggregate-byte ceilings. Text uses strict UTF-8 decoding and Unicode-safe character chunks. Inline content is limited to verified UTF-8 plain text and signature-matched PNG, JPEG, or GIF data. HTML, SVG, XML, JavaScript, PDF, Office formats, and unknown types are not returned inline. Suspicious path-like and Unicode-spoofed filenames are rejected. Archives are never decompressed and files are not written by the current implementation.

### Data leakage and logs

Operational logs contain request identifiers, fixed-origin URLs, status, counts, and timing—not response bodies or caller headers. Authorization, cookies, tokens, secrets, passwords, document text, and file bytes are recursively redacted if passed as log fields. Protocol messages remain separate from stderr logs.

### Supply chain and runtime

Exact npm versions and integrity hashes are committed in `package-lock.json`. `npm run security:audit` fails on high or critical known advisories in pull-request, branch, and release workflows; `npm run security:licenses` fails on missing or unapproved dependency licenses. `npm run security:sbom` emits a CycloneDX application SBOM for production dependencies. CI adds pinned Trivy source/dependency/misconfiguration/secret scanning, the release workflow scans the exact built image before publication and includes a checksummed SARIF report, and a pinned CodeQL workflow runs extended JavaScript/TypeScript security queries. Dependabot opens weekly, separately reviewable npm, Docker, and GitHub Actions update pull requests, which run the same CI gates. Release automation validates tag/version consistency, uses npm trusted-publisher OIDC without a long-lived registry token, publishes npm provenance, pins workflow actions to full revisions, emits a source archive, manifest, SBOM, scan report, and SHA-256 checksums, and creates short-lived-key GitHub/Sigstore attestations for the checksummed artifacts and published container digest. The Docker build uses an exact Node version and multi-platform digest, disables dependency lifecycle scripts, prunes development dependencies, and runs as the image's unprivileged `node` user.

The stronger runtime settings are in `compose.yaml`. A direct `docker run` deployment must apply equivalent `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, resource-limit, and loopback/proxy settings.

## Residual risks

- HTTP defaults to a local-only Host policy. Bearer mode is available for a simple authenticated deployment, and trusted-proxy mode requires an isolated listener behind an authenticating TLS gateway. Neither replaces distributed abuse controls, and bearer mode is not a full OAuth issuer/audience/scope implementation.
- Rate limits are per process, memory-only, and reset on restart. Multiple replicas require a shared gateway or distributed limiter for a global service-wide quota.
- Prompt-injection labeling reduces accidental instruction following but cannot control how every downstream model or client treats source data. Clients must maintain the data/instruction boundary.
- Signature verification covers only the small inline raster allowlist and is not malware scanning. Clients opening original documents through canonical NLA links need their own sandboxing and content-security controls.
- DNS, certificate authorities, the NLA service, npm registry, and official Node image publication remain trusted dependencies. Digest and lockfile updates still require review and rescanning.
- TLS terminates outside the Node process. A misconfigured reverse proxy can expose plaintext traffic, spoofed forwarding headers, or an incorrect public Host/Origin policy.
- Readiness depends on NLA availability. An upstream outage intentionally makes `/readyz` fail while `/healthz` continues to report process liveness.
- The Compose restrictions protect container deployments only. Stdio and direct host execution inherit the invoking user's operating-system permissions.

## Security verification

```bash
npm run security:licenses
npm run security:audit
npm run security:sbom > sbom.cdx.json
npm test -- tests/security
npm run ci
docker compose config --quiet
```

Review and regenerate the base-image digest, advisory result, license allowlist, and SBOM whenever dependencies or the Node image change.

Automated update pull requests are maintenance proposals, not trusted changes. Review lockfile and action/container revision changes, confirm the upstream release and license, and require CI before merging. Major updates remain separate so runtime, protocol, and security-boundary changes receive explicit review.

The repository host must have Dependabot alerts and security updates enabled. The committed configuration schedules version updates against the repository's default branch without overriding `target-branch`, so host-generated security updates retain their default-branch behavior.

Review this threat model at least annually and whenever the MCP SDK/spec, transport, authentication, inline content, OCR/extraction, writable behavior, deployment exposure, or NLA endpoint/access model changes. Record the review revision and any newly accepted or remediated risks.
