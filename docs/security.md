# Security model

This document records the focused threat-model review for the public, read-only NLA MCP server. It covers the stdio and stateless Streamable HTTP profiles, the NLA API client, inline content resources, package dependencies, and the container runtime. Repository administration, local OCR, authentication, and writable downloads are outside the current scope.

## Assets and trust boundaries

| Boundary                | Untrusted input                                                           | Protected asset or property                          | Primary controls                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MCP client → server     | Tool arguments, HTTP headers, JSON bodies                                 | Process availability and read-only behavior          | Zod schemas, body limits, rate limits, stateless requests, Host/Origin checks                                            |
| NLA API → server        | HAL links, metadata, highlights, filenames, text, binary bytes, redirects | Network boundary, model context, terminal/log safety | Fixed HTTPS host, base-path checks, redirect validation, byte limits, UTF-8 validation, filename checks, control removal |
| Server → model client   | Catalogue text and document content                                       | Instruction integrity                                | Static server instructions, untrusted-data labels, separate provenance, no evaluation/rendering/execution                |
| Build inputs → artifact | npm packages and container base image                                     | Artifact integrity and reproducibility               | Lockfile, `npm ci --ignore-scripts`, advisory/license checks, SBOM generation, digest-pinned base image                  |
| Container → host        | Compromised Node process                                                  | Host filesystem and kernel                           | Non-root UID, read-only root, all capabilities dropped, no-new-privileges, PID/memory/CPU limits, loopback publishing    |

The only permitted upstream application host is `api.nla.am`, over HTTPS and under `/server/api`. Redirects and non-templated or templated HAL link prefixes are checked against the same boundary before use. NLA catalogue content is data, never configuration or server instructions.

## Threat review

### SSRF and unsafe redirects

An attacker may supply an identifier, raw API path, malicious HAL link, redirect, encoded traversal sequence, userinfo URL, alternate port, or private-network address. The configuration fixes the upstream hostname to `api.nla.am`; URL policy rejects HTTP, credentials, non-default ports, other hosts, paths outside the API root, encoded separators/traversal, and protocol-relative URLs. Every redirect is manually processed, revalidated, and bounded. The raw API tool separately permits only registered read paths and generated query parameters.

### Prompt injection and hostile content

Metadata, highlights, extracted text, and filenames can contain instructions, HTML, scripts, or terminal escape sequences. The server preserves ordinary source text for research fidelity but strips dangerous control characters. Static instructions and tool descriptions never incorporate upstream strings. Extracted text includes `untrustedSourceData: true` provenance, and tool descriptions identify metadata as untrusted. The server does not render HTML, execute links, scripts, macros, archives, or document commands.

### Resource exhaustion and malicious files

Input schemas cap strings, arrays, page sizes, offsets, and raw-query shapes. The HTTP transport caps request bytes before JSON parsing and rejects compressed bodies. NLA responses are streamed under byte limits even when `Content-Length` is absent or false. Text uses strict UTF-8 decoding and Unicode-safe character chunks. Inline binary content is capped and known PDF/image types receive basic signature validation. Suspicious path-like filenames are rejected. Archives are never decompressed and files are not written by the current implementation.

### Data leakage and logs

Operational logs contain request identifiers, fixed-origin URLs, status, counts, and timing—not response bodies or caller headers. Authorization, cookies, tokens, secrets, passwords, document text, and file bytes are recursively redacted if passed as log fields. Protocol messages remain separate from stderr logs.

### Supply chain and runtime

Exact npm versions and integrity hashes are committed in `package-lock.json`. `npm run security:audit` fails on high or critical known advisories in pull-request, branch, and release workflows; `npm run security:licenses` fails on missing or unapproved dependency licenses. `npm run security:sbom` emits a CycloneDX application SBOM for production dependencies. Dependabot opens weekly, separately reviewable npm, Docker, and GitHub Actions update pull requests, which run the same CI gates. Release automation validates tag/version consistency, publishes npm provenance, pins workflow actions to full revisions, and emits a source archive, manifest, SBOM, and SHA-256 checksums. The Docker build uses an exact Node version and multi-platform digest, disables dependency lifecycle scripts, prunes development dependencies, and runs as the image's unprivileged `node` user.

The stronger runtime settings are in `compose.yaml`. A direct `docker run` deployment must apply equivalent `--read-only`, `--cap-drop=ALL`, `--security-opt=no-new-privileges`, resource-limit, and loopback/proxy settings.

## Residual risks

- Hosted HTTP is unauthenticated. Public deployments remain vulnerable to distributed abuse beyond the in-process fixed-window limiter. Use a trusted TLS reverse proxy with authentication or external rate limiting before internet exposure.
- Rate limits are per process, memory-only, and reset on restart. Multiple replicas require a shared gateway or distributed limiter for a global service-wide quota.
- Prompt-injection labeling reduces accidental instruction following but cannot control how every downstream model or client treats source data. Clients must maintain the data/instruction boundary.
- Basic signatures are not malware scanning or complete MIME verification. Clients opening original documents need their own sandboxing and content-security controls.
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
