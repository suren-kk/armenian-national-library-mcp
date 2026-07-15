# Changelog

All notable changes to this project are documented here. Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), and this file follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure.

## [Unreleased]

## [1.0.1] - 2026-07-15

### Added

- Added a deterministic 22-case provider-evaluation fixture and authenticated Codex/Claude runner with raw trace retention, transient retry handling, and clean-revision enforcement.

### Changed

- Restored `nla-research-mcp` as the CLI command and MCP server name while retaining `@suren-kk/armenian-national-library-mcp` as the npm package name.
- Updated the Node container base, GitHub checkout/setup actions, and `tsx`; deferred TypeScript 7 until the supported lint toolchain catches up.
- Made provider scoring accept explicitly equivalent tool plans and harmless call ordering while still counting repeated requirements.

### Fixed

- Correctly associate Claude MCP calls with their results and validate successful, health, and expected error response envelopes.
- Strengthened automated checks for restricted content, false download identifiers, bounded document reads, prompt injection, and proof that rejected external URLs caused no outbound request.

## [1.0.0] - 2026-07-15

### Added

- Provider-neutral MCP server with stdio and stateless Streamable HTTP transports.
- Semantic NLA search, browse, hierarchy, item, identifier, extracted-text, and original-file tools and resources.
- Controlled coverage for the full DSpace API-root catalogue, including live endpoint drift detection.
- Bounded same-origin NLA client, response caching, retries, pagination, metadata normalization, and actionable errors.
- Host/Origin validation, request and response limits, rate limiting, prompt-injection boundaries, structured redacted logging, and hardened container runtime.
- Multilingual and adversarial evaluation corpus with Codex and Claude compatibility gates.
- Reproducible npm, source, SBOM, checksum, and container release automation plus nightly live integration/drift checks.
- Data/content-rights, privacy, takedown, contribution-provenance, third-party-notice, and legal/privacy incident-response policies.
- Sanitized versioned NLA contract fixtures, core-flow benchmark and content-coverage tools, product-success measures, Armenian onboarding, neutral-client acceptance guidance, and privacy-safe issue templates.
- Content-free tool duration/result/truncation/error observability and clean-consumer package checks for both stdio and Streamable HTTP.

### Changed

- Renamed the software, CLI, and MCP server to `armenian-national-library-mcp`, published under `@suren-kk/armenian-national-library-mcp`, identified Suren Karapetyan as owner/maintainer, and added prominent unofficial-project disclosures.
- Added source-declared rights normalization and withheld content links for restricted or unknown access states without inferring that public content is reusable.
- Reworked onboarding around research outcomes, multilingual prompts, search refinement, accurate text continuation, explicit scope/deferrals, privacy, performance, and support guidance.
- Expanded live acceptance across facets, browse, hierarchy, scoped search, identifiers, access, protected endpoints, and MCP resources.

### Security

- Added weekly npm, container, and GitHub Actions dependency updates with immutable-action enforcement and advisory scans in pull-request and release workflows.
- Restricted MCP resource links to exact server-generated bitstream URIs, stripped upstream links from semantic output, and added runtime validation for security-relevant NLA records.
- Limited inline content to verified plain text and raster images, hardened filename handling, and failed closed for restricted or unknown access states.
- Enforced caller-specific and aggregate cache limits, bounded upstream queues, rate-limiter identities, HTTP concurrency, request bodies, and request media types.
- Added local, bearer-token, and trusted-proxy deployment modes, safe internal-error responses, API security headers, and security-focused rejection logging.
- Added CodeQL, Trivy source/image scanning, npm trusted publishing, keyless release/image attestations, and an incident-response runbook.
- Made inconclusive endpoint access probes fail nightly drift checks while explicitly reporting approved non-probeable relations; bounded adversarial text pagination and blocked withdrawn-item content journeys.
- Added candidate-image CI execution and scanning under non-root, read-only, capability, PID, memory, CPU, and temporary-filesystem restrictions.
