# Changelog

All notable changes to this project are documented here. Releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html), and this file follows the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) structure.

## [Unreleased]

### Changed

- Renamed the software and CLI to `nla-research-mcp`, identified Suren Karapetyan as owner/maintainer, added prominent unofficial-project disclosures, and blocked publication until a personal npm scope and canonical GitHub repository are configured.
- Added source-declared rights normalization and withheld content links for restricted or unknown access states without inferring that public content is reusable.

### Added

- Added data/content-rights, privacy, takedown, contribution-provenance, third-party-notice, and legal/privacy incident-response policies.

### Security

- Added weekly npm, container, and GitHub Actions dependency updates with immutable-action enforcement and advisory scans in pull-request and release workflows.
- Restricted MCP resource links to exact server-generated bitstream URIs, stripped upstream links from semantic output, and added runtime validation for security-relevant NLA records.
- Limited inline content to verified plain text and raster images, hardened filename handling, and failed closed for restricted or unknown access states.
- Enforced caller-specific and aggregate cache limits, bounded upstream queues, rate-limiter identities, HTTP concurrency, request bodies, and request media types.
- Added local, bearer-token, and trusted-proxy deployment modes, safe internal-error responses, API security headers, and security-focused rejection logging.
- Added CodeQL, Trivy source/image scanning, npm trusted publishing, keyless release/image attestations, and an incident-response runbook.

## [1.0.0] - 2026-07-14

### Added

- Provider-neutral MCP server with stdio and stateless Streamable HTTP transports.
- Semantic NLA search, browse, hierarchy, item, identifier, extracted-text, and original-file tools and resources.
- Controlled coverage for the full DSpace API-root catalogue, including live endpoint drift detection.
- Bounded same-origin NLA client, response caching, retries, pagination, metadata normalization, and actionable errors.
- Host/Origin validation, request and response limits, rate limiting, prompt-injection boundaries, structured redacted logging, and hardened container runtime.
- Multilingual and adversarial evaluation corpus with Codex and Claude compatibility gates.
- Reproducible npm, source, SBOM, checksum, and container release automation plus nightly live integration/drift checks.
