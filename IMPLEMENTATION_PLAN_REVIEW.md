# Implementation Plan Completion Review

Review updated: 2026-07-15

Reviewed state: working tree based on `fca804e61383996bc3f272a5d594d95512e8114d`

## Executive assessment

The locally implementable engineering scope in the plan is complete for the approved initial public-read product. The repository provides a provider-neutral TypeScript MCP server, 23 bounded read-only tools, static and templated resources, stdio and stateless Streamable HTTP transports, a fixed-host NLA client, complete endpoint registry, normalized rights-aware metadata, safe text/file behavior, release automation, container hardening, deterministic/live tests, and multilingual/adversarial evaluation infrastructure.

The security, technical, product, and implementation-plan reviews have now been reconciled. Earlier findings about resource-link promotion, cache limits, output schemas, same-field filters, file pagination, active MIME types, untrusted upstream schemas/links, queued cancellation, error leakage, package consumption, live journey breadth, and inconclusive access probes are remediated and regression-tested. Proposed registry tools and object metadata resources are deliberately deferred in the approved product scope rather than silently unfinished.

Plan completion is blocked only by release-candidate evidence and external operations: full Codex/Claude corpus results, neutral-client acceptance, the clean-candidate performance baseline, repository controls, and actual publication. These cannot all be truthfully completed by changing local source code alone.

## Status by plan area

| Plan area               | Status                      | Evidence or remaining gate                                                                                                                          |
| ----------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation              | Complete                    | Strict TypeScript, pinned SDK/runtime, validated config, logging/metrics, stdio, and release commands                                               |
| NLA client              | Complete                    | Fixed origin, HAL, retries, cancellation, streaming byte caps, representation-aware byte-bounded cache, schemas, and sanitized fixtures             |
| Semantic tools          | Complete for approved scope | 23 tools, specific output schemas, official-client success/failure coverage, descriptions, defaults, and annotations                                |
| Text and files          | Complete for approved scope | Lossless continuation, bounded discovery, whole-file ceilings, verified inline allowlist, rights/access separation, and canonical complex-file URLs |
| Endpoint coverage       | Complete                    | 80/80 registry relations; controlled raw reads; conclusive direct probes or explicit non-probeable classification                                   |
| Remote transport        | Implementation complete     | Stateless HTTP, authentication modes, quotas, slow-body limits, readiness, and hardened container CI are implemented; external run evidence remains |
| Security hardening      | Complete for approved scope | Threat model and applicable deterministic adversarial tests cover the supported read-only behavior                                                  |
| Evals and compatibility | Infrastructure complete     | Corpus, scorer, stdio harness, and evidence format exist; full same-commit provider/client execution remains                                        |
| Release                 | Automation complete         | Public identity and owner posture are confirmed; platform configuration, tag, and publication remain                                                |

Unchecked entries below require external access, owner judgment, paid/provider-backed execution, or a clean committed release candidate. A partially complete gate remains unchecked until all of its evidence exists.

## Remaining release gates

- [ ] **Run the full two-provider release evaluation.** Execute all 22 multilingual/adversarial cases with at least one current Codex/OpenAI client and one current Claude/Anthropic client on the same clean candidate commit. Retain schema validity, host/restriction handling, tool selection, grounded completion, citation, prompt-injection, model/client version, cost/token, and reviewer evidence; pass `npm run eval:score`. **Explicitly deferred by the owner on 2026-07-15; provider access/cost and human review remain required.**

- [ ] **Complete neutral-client acceptance.** Follow `docs/client-acceptance.md` with Codex, Claude, and MCP Inspector against both the packed stdio executable and one TLS-protected authenticated/private `/mcp` endpoint on the same candidate revision. Retain sanitized evidence for discovery, representative tools/resources, stateless requests, rejected credentials/origins, and shutdown. **Provider/client-backed portions are deferred with the evaluation; a private test environment and client access remain required.**

- [ ] **Activate repository controls and publish verified artifacts.** Verify required branch checks, Actions, Dependabot/security settings, private vulnerability reporting, protected release environment, personal npm scope/trusted publishing, and GHCR permissions. After every prior gate passes, create the reviewed signed tag and verify npm provenance/integrity, checksummed source assets, attestations, exact image digest, and the clean-user flow. **Owner credentials and GitHub/npm configuration required.**

## Owner release decisions

- [x] The canonical GitHub repository is `suren-kk/armenian-national-library-mcp`, the public npm package is `@suren-kk/armenian-national-library-mcp`, the CLI and MCP server name are `armenian-national-library-mcp`, and the first public version remains `1.0.0`.
- [x] The owner chose publication as independent, unofficial research software using the repository's disclosures, rights warnings, privacy policy, and takedown process. This records the maintainer's release posture; it does not claim NLA authorization, decide third-party content rights, or constitute legal advice.
- [x] No public hosted MCP endpoint is planned. Streamable HTTP remains a supported self-host/private-boundary transport and its release acceptance may use a temporary private test deployment.
- [x] The initial local performance environment is the maintainer's macOS arm64 machine with Node.js 24.15.0. Five clean-candidate iterations passed every investigation threshold, and the aggregate-only baseline is retained under `evals/baselines/`.

## Completed implementation remediation

### Protocol and trust boundaries

- [x] Server-created typed fields are the only source of MCP resource links; arbitrary nested upstream `resource_link` objects and unsafe schemes remain inert serialized data.
- [x] Every semantic tool advertises a specific output schema and validates internal output before protocol serialization.
- [x] All 23 registered tools have official MCP client success/failure coverage, stable defaults, read-only annotations, and a tested read-only description contract.
- [x] Unexpected errors return a generic correlated response while safe known errors retain actionable categories; internal messages, paths, queries, and secrets do not leak.

### HTTP, caching, cancellation, and resilience

- [x] Fresh, cached, coalesced, and `304` responses obey the active byte limit; cache identity includes representation and both entry-count and aggregate-byte ceilings are enforced.
- [x] Concurrent identical reads coalesce without allowing one caller's cancellation to abort another; queued callers can cancel before acquiring a slot.
- [x] Retry/redirect bodies are cancelled, backoff/redirect paths remain bounded, slow HTTP request bodies time out, and request/queue/concurrency limits have deterministic tests.
- [x] Pagination requires safe non-negative integers and consistent totals. Text discovery has independent record and page ceilings so empty/adversarial pagination cannot loop indefinitely.

### Search, metadata, files, and rights

- [x] Repeated same-field filters preserve stable repeated query parameters and documented AND semantics.
- [x] Bundle and bitstream pages expose explicit continuation; automatic text selection traverses later pages under strict page/record bounds.
- [x] Runtime schemas validate metadata values, objects, search hits, bitstreams, checksums, formats, access statuses, and consumed pagination while preserving safe unknown metadata.
- [x] Semantic output strips upstream HAL links; every followed link/redirect stays under the exact HTTPS NLA API boundary.
- [x] Only verified UTF-8 text and signature-matched PNG/JPEG/GIF content may be inlined. HTML, SVG, XML, scripts, PDF, Office, archives, unknown formats, and oversized content remain metadata plus canonical links.
- [x] Unknown/restricted/embargoed/withdrawn states fail closed. Public technical access never implies reuse permission, and missing reuse declarations emit a warning.
- [x] The bounded whole-text-file design is explicitly accepted: `NLA_MAX_TEXT_BYTES` controls upstream memory/network use while `max_chars` controls model output; local extraction/OCR remains deferred.

### Contracts, live drift, and operations

- [x] Sanitized versioned fixtures cover the API root, search, facets, browse, communities, collections, bundles, text/original bitstreams, formats, public/embargoed status, and `401`/`403`/`404`/`429`/`5xx` mapping, including safe unknown-field preservation.
- [x] The live suite covers identity/search, facets, browse, hierarchy, scoped search, identifiers, access, text/original files, protected behavior, endpoint/raw reads, and MCP resource reading without mutable-count assertions.
- [x] Endpoint drift checks all 80 advertised relations. Direct access-probe failures now fail the gate; base relations that cannot authoritatively answer a safe bounded probe are explicitly reported in `accessChecksNotProbeable` rather than silently skipped.
- [x] Tool-level structured events and optional log metrics report only bounded tool name, outcome/error category, duration, result count, and truncation; upstream metrics cover latency, bytes, retries, cache, active work, and queue depth without user content.
- [x] Performance budgets and an opt-in live benchmark cover search, item, files, first text, continuation, and a structured missing-item path; deterministic tests lock cache/concurrency/call-budget mechanics.

### Scope, packaging, and release engineering

- [x] Planned metadata registry tools and item/community/collection metadata resources are explicitly deferred in `docs/product-scope.md` and `IMPLEMENTATION_PLAN.md`; semantic tools and approved raw reads are the supported bounded surface.
- [x] Dormant file-write configuration is absent; authenticated NLA access, mutations, local extraction/OCR, stateful HTTP, resumability, tasks, and `save_file` remain outside the release.
- [x] Package metadata identifies the canonical source, homepage, issues, maintainer, license, and discovery keywords, with release validation preventing identity drift.
- [x] The packed tarball is installed into a clean temporary consumer and verified through both its CLI/stdio transport and local HTTP transport from another working directory.
- [x] CI is configured to build and scan the exact candidate image, run it as non-root under read-only/capability/PID/memory/CPU/tmpfs restrictions, and check health before release. The tagged workflow repeats gates, scans, checksums, attests, and publishes immutable npm/container/source artifacts; its successful candidate run remains part of the publication gate.
- [x] `docs/client-acceptance.md` defines the neutral-client and hosted evidence gate; `docs/releasing.md` requires it on the same clean candidate revision.

## Validation evidence

Validation run on 2026-07-15 against this working tree:

- `npm run ci` passed formatting, lint, type checking, release metadata, dependency-license policy, coverage, build, and package-consumer validation: 37 deterministic test files passed, 229 tests passed, and 8 opt-in live tests were skipped as designed. Aggregate coverage was 83.49% statements, 74.30% branches, 89.30% functions, and 84.49% lines.
- The packed `armenian-national-library-mcp-1.0.0.tgz` contained 50 files and passed installation plus official-client discovery/resource checks from a clean temporary consumer over both stdio and Streamable HTTP.
- The opt-in live integration suite passed all 8 current NLA public-read journeys.
- Endpoint drift validation passed all 80 advertised relations with no registry changes or inconclusive failures; 59 base relations are explicitly classified as not safely/directly probeable rather than silently skipped.
- The registry-backed high-severity dependency audit reported zero vulnerabilities.
- The version 1.0.0 local performance baseline measured clean runtime commit `ed0a011a55cab6bf2c5902a591d13d6d90de6925` over five iterations. Cold P95 latency was 14–255 ms, and all cacheable warm journeys completed in 0–2 ms with no upstream calls.
- Checksummed npm, source, manifest, and CycloneDX SBOM artifacts were reproduced from a clean commit, every SHA-256 checksum passed, and npm's publication dry run accepted the exact 50-file public tarball. Actual registry publication remains blocked on npm authentication and trusted-publisher configuration.

This is local development evidence. It does not replace the clean-candidate provider, neutral-client, private HTTP, GitHub Actions candidate-image, or publication evidence listed under the remaining release gates.

## Deliberately deferred or optional scope

- Authenticated NLA records and the `authenticated-read` profile.
- Admin/mutation/submission workflows and arbitrary URL fetching.
- Local PDF extraction, OCR, and filesystem writes.
- Stateful HTTP sessions, standalone SSE resumability, and server-side tasks.
- OAuth inside the MCP process when the supported HTTP profile remains behind the documented private/authenticated boundary.
- Separate metadata-schema/metadata-field/bitstream-format registry tools and item/community/collection metadata resources, unless user evidence justifies expanding the stable surface.
- OpenTelemetry export; content-free structured logs and the optional log-metrics adapter are the supported initial observability profile.

## Current completion decision

**Engineering status: locally complete for the approved initial scope. Release status: gated.** Do not mark the overall plan or public release complete until the remaining release gates above are evidenced on one clean candidate revision.
