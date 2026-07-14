# Technical Structure and Implementation Review

Review date: 2026-07-14

Reviewed revision: `83e0f03f7968ae3720e928a17df0485d2e7e266f`

## Executive assessment

The implementation has a sound technical foundation. It uses strict TypeScript, keeps provider concerns outside the runtime, separates MCP transport from repository access, bounds network and content operations, validates same-origin navigation, presents consistent envelopes, and has unusually thorough security, protocol, release, and compatibility infrastructure. The live NLA smoke suite and deterministic CI pass on the reviewed code.

The largest remaining risks are concentrated at contract boundaries rather than in the basic architecture:

- cached responses can bypass a later request's smaller byte limit;
- most upstream data is accepted through partial hand-written checks and type assertions;
- all semantic tools advertise `data: unknown` instead of concrete output schemas;
- repeated search filters for the same field are silently collapsed;
- bundle and bitstream pagination can hide content without offering continuation;
- cancellation and retry paths can retain queued work or unread response bodies.

No confirmed Critical defect was found. The High items should be resolved before treating the current `1.0.0` implementation as a stable public contract or exposing the HTTP transport as a shared production service.

| Area             | Assessment                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Architecture     | Clear layers and dependency direction; several core modules have grown too broad                |
| Type safety      | Strong compiler settings; runtime response typing is substantially weaker                       |
| Network security | Strong fixed-origin and redirect controls                                                       |
| Resource safety  | Good streaming limits; cache and pagination paths weaken guarantees                             |
| MCP contracts    | Protocol-compatible; semantic output schemas are too generic                                    |
| Test quality     | Strong unit/security base; semantic and live surface coverage is incomplete                     |
| Operations       | Good logs, health probes, container hardening, and release automation; limited metrics          |
| Maintainability  | Good naming and documentation; schema/type duplication and large modules will raise change cost |

## Severity definitions

- **Critical (P0):** exploitable boundary failure, data loss, or runtime blocker that requires immediate correction.
- **High (P1):** correctness, safety, or compatibility defect that can break a core workflow or production guarantee.
- **Medium (P2):** structural, resilience, performance, or testing weakness likely to increase failures or maintenance cost.
- **Low (P3):** cleanup and engineering polish with limited immediate runtime impact.

## Critical — P0

No confirmed Critical issue was identified during this review.

## High — P1

- [ ] **Enforce response limits on cache hits and cache revalidation.** `NlaClient.request()` returns a fresh cache entry before checking the current call's `maxResponseBytes`. This was reproduced by caching a 100-byte response with a 100-byte allowance and then receiving all 100 cached bytes from a request capped at 4 bytes. A `304` path has the same issue. Validate cached byte length against every request, include representation-affecting headers in the cache key, and keep the effective limit independent from the request that populated the cache. **Done when:** fresh, cached, and revalidated responses all fail with `NLA_RESPONSE_TOO_LARGE` under a smaller current cap, with regression tests for JSON, raw reads, text, and binary resources.

- [ ] **Add a total cache-byte budget.** The cache bounds entry count but not retained bytes. At the defaults, 128 entries can retain roughly 256 MiB of response payloads before JavaScript/object overhead, which competes with the 512 MiB Compose limit. Track entry byte sizes, evict by both LRU count and total bytes, and expose safe configuration bounds. **Done when:** tests prove deterministic eviction by byte budget and the documented worst-case cache footprint leaves sufficient process headroom.

- [ ] **Adopt schema-first validation for upstream response types.** `asDspaceObject`, `asBitstream`, `asBundle`, `asFormat`, `asAccessStatus`, and pagination parsing validate only selected fields and then cast the complete value to a richer TypeScript type. Later code assumes unchecked fields such as metadata arrays, format descriptions, extensions, checksum structure, and access values. Define reusable Zod schemas for the HAL objects consumed by each mapper and derive TypeScript types from them. Preserve unknown fields with passthrough where forward compatibility is required. **Done when:** malformed nested metadata and partially shaped format/access records produce an actionable `NLA_INVALID_RESPONSE` before mapping, and no production mapper relies on an unchecked structural cast.

- [ ] **Advertise and validate concrete output schemas for every tool.** `toolEnvelopeOutput` currently defines `data` as `z.unknown()`, so the MCP contract cannot detect missing fields or incompatible types. Create per-tool data and envelope schemas, use them as each tool's `outputSchema`, and parse internal results before returning them. **Done when:** `tools/list` exposes useful concrete schemas and a contract test covers every tool's success shape, including pagination, warnings, resources, and provenance.

- [ ] **Preserve repeated filters for the same search field.** `NlaRepository.search()` writes filters into an object using ``query[`f.${field}`]``, so later filters overwrite earlier values. This was reproduced with two `author` filters: only the second reached NLA. Group repeated filters into arrays so `URLSearchParams.append()` sends every intended value, and define their AND/OR semantics. **Done when:** tests cover repeated same-field and mixed-field filters and verify the exact upstream query string.

- [ ] **Make bundle and bitstream pagination lossless.** `listItemFiles()` requests only page zero with `maxPageSize` for bundles and for each bundle's bitstreams. It reports truncation but offers no cursor/page input, so callers cannot retrieve omitted files; `getItemText()` may fail to locate a valid text bitstream beyond the first page. Either traverse bounded pages internally with a total-item ceiling or expose explicit continuation tools/inputs. **Done when:** every omitted file is retrievable, limits remain bounded, and text selection can continue safely across pages.

- [ ] **Make queued requests cancellable and dispose retry/redirect responses.** The semaphore wait queue does not observe an abort signal, and retry/redirect branches continue without explicitly canceling or draining the previous response body. Under cancellation, rate limiting, redirects, or repeated `5xx` responses, this can retain unnecessary work and reduce connection-pool availability. Add abort-aware semaphore acquisition and cancel response bodies before retrying or following redirects. **Done when:** tests cancel while queued, during backoff, during streaming, and across redirects without issuing later fetches or leaving active slots occupied.

- [ ] **Create a safe, observable tool error boundary.** Non-`NlaError` failures are returned to clients with their original `Error.message` and are not logged by the tool layer. This can disclose internal implementation details while leaving operators without a correlation record. Generate a request/error ID, log the original exception to stderr with redaction, and return a stable generic internal-error payload. Keep known `NlaError` codes actionable. **Done when:** unexpected errors never expose paths, stack details, or configuration values to MCP clients and can be correlated with a sanitized operator log.

- [ ] **Validate every advertised semantic tool through MCP, not only repository methods.** Current protocol tests list 23 tools but call only health and capabilities; contract tests directly cover search and raw reads, while the live suite exercises only a subset. Build a table-driven MCP test harness with representative success and failure fixtures for all tools, validating input defaults, output schemas, annotations, serialized fallback content, and cancellation. **Done when:** adding a tool without a complete MCP contract case fails CI.

- [ ] **Require an authenticated/externally limited boundary for shared HTTP deployments.** The HTTP implementation is deliberately stateless and unauthenticated, with per-process fixed-window limits. For any internet-facing shared service, integrate an authenticated reverse proxy or MCP authorization layer, service-wide quotas, and distributed abuse controls; otherwise enforce/document private-network deployment. **Done when:** production configuration cannot unintentionally expose anonymous, horizontally amplified NLA access.

## Medium — P2

- [ ] **Separate the large repository and registration modules by bounded context.** `repository.ts` is over 600 lines and combines discovery, hierarchy, items, content delegation, identifiers, endpoint drift, and raw access; `register-tools.ts` centrally wires all 23 tools. Split these into cohesive services/modules while keeping a thin composition root and shared envelope utilities. **Done when:** changes to one domain do not require editing a central god module, and public contracts remain covered by integration tests.

- [ ] **Remove schema/type duplication by deriving static types from runtime schemas.** Interfaces in `nla/types.ts`, Zod input/output schemas, mapper return shapes, and eval schemas evolve independently. Make runtime schemas the source of truth for boundary data and use `z.infer`/`z.output` for static types. Keep internal domain types separate only where they intentionally differ. **Done when:** a contract field cannot change in one representation without a compile-time or test failure elsewhere.

- [ ] **Coalesce identical in-flight upstream requests.** The shared HTTP client bounds concurrency but allows multiple simultaneous misses for the same URL to issue duplicate NLA requests. Add single-flight deduplication keyed consistently with the corrected cache key, with independent caller cancellation that does not abort remaining subscribers. **Done when:** concurrent identical reads make one upstream request and all callers receive the same validated result.

- [ ] **Avoid reparsing the endpoint registry for each stateless HTTP request.** Each fresh MCP server constructs a repository whose default constructor synchronously reads and parses `config/endpoint-matrix.yaml`. Load and validate immutable registry data once in the application composition root, then inject it into per-request server instances. **Done when:** HTTP requests perform no synchronous filesystem reads and the same frozen registry instance is shared safely.

- [ ] **Define and validate domain-specific search inputs.** `sort`, facet names, and filter fields are mostly free-form; large combinations can create long URLs and upstream-dependent failures. Model supported sort syntax and known semantic facets, bound total encoded query length, and return precise validation guidance. Retain an explicitly marked advanced escape hatch only where necessary. **Done when:** invalid sort/filter combinations fail locally and valid combinations have exact request-construction tests.

- [ ] **Tighten pagination validation.** `parsePage()` accepts any finite non-negative number, including fractional page numbers and counts, even though downstream schemas and types require integers. Validate safe non-negative integers and consistency such as `number < totalPages` where applicable without rejecting a legitimate empty result. **Done when:** malformed fractional, unsafe, and contradictory page fixtures are rejected before reaching MCP output validation.

- [ ] **Handle multiple representations and media types explicitly.** `getJson()` accepts any content type containing the substring `json`, while cache identity does not currently reflect `Accept`. Parse media types with exact `application/json`/`+json` rules, define expected content types per operation, and reject surprising representations consistently. **Done when:** JSONP and misleading media types are rejected and representation-specific cache tests pass.

- [ ] **Bound and clarify large-text retrieval mechanics.** Chunking limits model output but the implementation downloads and decodes the entire text bitstream before slicing, capped indirectly by `NLA_MAX_METADATA_BYTES`. Document that network retrieval is whole-file, use byte/range support if NLA reliably provides it, or add a dedicated text-download ceiling and cached decoded representation. **Done when:** large text behavior has explicit byte and character limits, predictable memory use, and performance tests for first and subsequent chunks.

- [ ] **Reduce N+1 work in file resolution.** Listing files performs bundle enumeration followed by format and access requests for every bitstream. Measure actual call counts and latency, reuse embedded data where trustworthy, cache immutable format records more effectively, or add lazy detail resolution. **Done when:** a benchmark establishes a call/latency budget and common multi-file items remain within it under cold-cache conditions.

- [ ] **Add structured operational metrics.** JSON logs are useful, but there are no counters/histograms for tool outcomes, upstream status classes, retries, timeouts, cache hit/eviction rates, queue depth, rate-limit rejection, or response sizes. Add a transport-neutral metrics abstraction with an optional production exporter, without logging queries or content. **Done when:** operators can diagnose latency, failures, capacity, and upstream pressure without inspecting user data.

- [ ] **Make time, randomness, and waiting injectable in the HTTP client.** Retry jitter, cache age, and timeout behavior depend directly on global clocks and timers, making edge cases slow or difficult to test. Inject clock, random, and sleep/timeout adapters. **Done when:** retry, `Retry-After`, cache expiry, cancellation, and backoff tests are deterministic and complete without real delays.

- [ ] **Add code-coverage reporting and meaningful thresholds.** Vitest declares reporters but CI has no coverage command, coverage provider dependency, or thresholds. Add statement/branch/function thresholds focused especially on `client.ts`, transports, resource handlers, schemas, and release scripts. Treat coverage as a gap detector rather than a substitute for behavioral assertions. **Done when:** CI publishes coverage and rejects material untested regressions.

- [ ] **Strengthen package-boundary testing.** The dry-run tarball builds, but most tests execute the source tree. Install the produced tarball into a temporary clean project, launch its `nla-mcp` bin from a different working directory, initialize an SDK client, read the endpoint catalogue, and verify shutdown. **Done when:** release CI proves that only published files are sufficient at runtime.

- [ ] **Align health naming with actual checks.** `get_repository_info` reports local configuration/capabilities but its description says it verifies server health; only HTTP `/readyz` reaches NLA. Rename the tool semantics or add an explicit bounded upstream status field shared by both transports. **Done when:** process health, configuration validity, and upstream readiness cannot be confused by callers.

- [ ] **Harden canonical identifier parsing.** Canonical handle URL parsing checks protocol, hostname, and path but does not reject credentials, non-default ports, queries, or fragments. Although the server never fetches that URL, accepting non-canonical variants contradicts the contract and complicates validation. Require the exact canonical authority and URL shape. **Done when:** only a plain `https://dspace.nla.am/handle/{prefix}/{suffix}` URL is accepted, with focused edge-case tests.

## Low — P3

- [ ] **Remove unsupported file-write configuration until the feature exists.** `NLA_ENABLE_FILE_WRITES` and `NLA_DOWNLOAD_DIR` are parsed and tested but no write tool is implemented. Delete the dormant settings or fail explicitly whenever writes are enabled so configuration cannot imply unavailable behavior.

- [ ] **Reduce production package surface.** The npm package includes build/evaluation/release scripts, declarations, and source maps that are not required by the CLI runtime. Decide whether the package is a CLI-only distribution or a supported library, then publish only the appropriate runtime files or define explicit `exports` for supported library entry points.

- [ ] **Consolidate overlapping content-limit tests.** Signature checks are split between `tests/security/content-limits.test.ts` and `tests/unit/content-limits.test.ts`. Merge or clearly separate policy tests from unit mechanics to reduce duplicated fixtures and ambiguous ownership.

- [ ] **Generate repetitive capability documentation from contracts.** Tool names, resource templates, defaults, and capability lists are repeated across code and Markdown. Add a check or generator that compares documentation with the registered schemas without replacing the human-written usage guidance.

- [ ] **Document architectural dependency rules.** Record allowed dependencies between transport, server, repository, client, content, schema, and security layers; optionally enforce them with lint rules. This will help preserve the current provider-neutral and read-only boundaries as modules are split.

## Recommended remediation order

1. Correct cache enforcement and add regression tests.
2. Introduce schema-first upstream validation and concrete per-tool output schemas.
3. Fix repeated search filters and lossless file pagination.
4. Harden cancellation, response disposal, and unexpected-error handling.
5. Expand table-driven MCP coverage and packed-package tests.
6. Address shared-HTTP authorization, cache capacity, request coalescing, and metrics.
7. Refactor large modules only after the contracts above are locked by tests.

## Evidence reviewed

- Runtime composition, configuration, MCP registration, transports, repository, NLA client, content resolver, schemas, resources, security policies, logging, evaluation, and release code under `src/`.
- All unit, contract, protocol, security, compatibility, evaluation, and live tests under `tests/`.
- Container, Compose, workflow, endpoint-registry, TypeScript, ESLint, Vitest, package, and release configuration.
- Reproduction: a 100-byte cached response was returned with `cacheHit: true` to a later request specifying `maxResponseBytes: 4`.
- Reproduction: two `author` filters generated only one upstream `f.author` value, containing the second filter.
- Live verification: the known item access-status response is accepted and mapped successfully.
- Current live suite: 4/4 tests pass and all 80 advertised endpoint relations match the registry.
- Current package dry run: build and tarball inspection succeed.
