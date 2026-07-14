# Implementation Plan Completion Review

Review date: 2026-07-14

Reviewed revision: `83e0f03f7968ae3720e928a17df0485d2e7e266f`

## Executive assessment

The planned product is substantially implemented. The repository contains a provider-neutral TypeScript MCP server, 23 read-only semantic/raw tools, stdio and stateless Streamable HTTP transports, a fixed-host NLA client, HAL and pagination handling, normalized metadata, text and bitstream access, an 80-relation endpoint registry, security controls, Docker packaging, CI/nightly/release workflows, an eval corpus, and user documentation.

The plan's final definition of done has not been reached. The largest remaining gaps are not basic scaffolding; they are release assurance and correctness at important boundaries:

1. Confirmed security/correctness defects remain in resource-link promotion, cache limit enforcement, repeated search filters, and file pagination.
2. MCP protocol tests do not call every tool and tool output schemas leave `data` as `unknown`.
3. The full multilingual/adversarial corpus has not been run through both provider families; the recorded baseline is only a health-tool smoke check from an older dirty revision.
4. Hosted HTTP compatibility has not been demonstrated with Codex, Claude, and MCP Inspector.
5. The npm package and container have not been published, and this checkout has no remote or release tag.

Accordingly, the implementation is suitable for continued local/internal testing, but it should not be described as satisfying all plan acceptance criteria or the final definition of done.

## Status by implementation phase

| Plan phase                    | Status     | Evidence and remaining gap                                                                                                    |
| ----------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1. Foundation                 | Complete   | Strict TypeScript, pinned SDK, config, logging, stdio, build/lint/test commands, and health tool are present.                 |
| 2. NLA client                 | Partial    | Core HTTP/HAL/cache behavior works, but cache, cancellation, schema-validation, and streaming gaps remain.                    |
| 3. Core semantic tools        | Partial    | Discovery, hierarchy, item, and identifier tools exist; concrete output contracts and complete behavioral coverage do not.    |
| 4. Text and file content      | Partial    | The tested 83 KB extraction and PDF link work; retrieval buffers whole files and file enumeration can truncate irretrievably. |
| 5. Complete endpoint coverage | Partial    | All 80 root relations match; 16 anonymous-access probes were skipped and three planned registry tools are absent.             |
| 6. Remote transport           | Partial    | HTTP transport and deterministic protocol tests pass; real hosted Codex/Claude/Inspector acceptance evidence is absent.       |
| 7. Security hardening         | Partial    | Threat model and many controls/tests exist, but confirmed release-blocking boundary and resource-limit issues remain.         |
| 8. Evals and compatibility    | Incomplete | Corpus/scorer and stdio smoke compatibility exist; no complete two-provider corpus result passes the release gates.           |
| 9. Release                    | Incomplete | Release automation exists, but no npm package, release tag, remote, published image, or clean-install user proof was found.   |

## Priority definitions

- **P0 — release blocker:** must be completed before claiming the plan is done or publishing a production release.
- **P1 — high:** required for a reliable public release and for explicit plan acceptance criteria.
- **P2 — medium:** material completeness, operability, or maintainability gap.
- **P3 — low:** small plan deviation or cleanup that should not block a controlled prerelease by itself.

## P0 — Release blockers

- [ ] **Prevent upstream data from being promoted into trusted MCP resource links.** `collectResourceLinks()` recursively promotes any returned object shaped like `{ type: "resource_link", uri, name }`. Because raw and semantic results contain upstream-controlled objects, NLA data can create links such as `file:` or arbitrary HTTPS links in an MCP result. Emit resource links only from server-created typed fields and validate the exact allowed `nla://`/canonical HTTPS forms. **Plan coverage:** security, prompt-injection resistance, stable tool output, and final safe-content definition. **Done when:** hostile nested resource-link objects remain inert serialized data and regression tests cover file, external, custom-scheme, and valid server-generated links.

- [ ] **Enforce response limits on cached and revalidated responses and bound total cache bytes.** The client enforces `maxResponseBytes` while initially reading a response but returns fresh cache hits and `304` entries without checking the current caller's limit. The cache also limits only entry count, so default settings can retain roughly 256 MiB of payload bytes before object/runtime overhead. Apply every request's active cap on every return path, include representation-affecting headers in cache identity, and evict by both entry count and aggregate bytes. **Plan coverage:** HTTP response-size enforcement, content safety, resource-exhaustion defense, and resilience. **Done when:** fresh, cached, and revalidated responses obey the same cap under any population order and worst-case cache memory is tested below a documented budget.

- [ ] **Run the complete release eval matrix against the exact clean release revision.** `evals/corpus.json` and the scorer cover 15 core and 7 adversarial cases, but the only recorded real-client baseline calls `get_repository_info` once per provider. It records commit `e22b982...`, not the reviewed revision, and explicitly records a dirty working tree. Run all cases with at least one OpenAI/Codex client and one Anthropic/Claude client, retain reviewed summaries, and pass `npm run eval:score`. **Plan coverage:** Phase 8 and all quantitative release gates. **Done when:** both provider families have complete same-commit results with 100% schema validity, host rejection, and restricted-content handling; at least 95% core tool selection; at least 90% grounded completion; and zero prompt-injection policy violations.

- [ ] **Resolve the remaining API/content authority gate before public distribution.** The independent, unofficial identity is established, but the repository does not evidence terms or written authority for automated NLA data/content delivery. Follow `DATA_AND_CONTENT_RIGHTS.md`; keep npm/container publication disabled until the permitted capability surface is documented and implemented. **Done when:** the API/content terms or a qualified review approve the release surface and prohibited paths are disabled and tested.

- [ ] **Publish and verify the release only after all gates pass.** As reviewed, `@nla-am/nla-mcp` returns npm `E404`, the checkout has no Git remote or tags, and there is no evidence of a published container/source release. Activate the canonical repository, required secrets/protections, nightly jobs, private vulnerability reporting, npm scope, and registry destination; create a clean signed/reviewed tag; then publish through the workflow. **Plan coverage:** Phase 9 and reproducible npm/container distributions. **Done when:** a new user can verify checksums/provenance, install the npm tarball or pull the exact image, connect from a clean environment, search NLA, read text, and obtain an original file link.

## P1 — High priority

- [ ] **Define concrete output schemas for every tool.** All envelope tools currently advertise the same schema with `data: z.unknown()`. This satisfies the presence of an `outputSchema` but not the plan's stable, schema-valid per-tool contracts or its 100% schema-valid release gate. Create and register per-tool data/envelope schemas and validate results before returning them. **Done when:** `tools/list` describes each real success shape and malformed internal output fails a table-driven contract test.

- [ ] **Call every registered tool through an official MCP client in protocol tests.** The server advertises 23 tools, but the main protocol test calls only `get_repository_info` and `get_api_capabilities`; search and raw tests bypass MCP and exercise repository methods directly. Add table-driven success and failure cases for all tools, including input defaults, output validation, resource links, annotations, serialization fallback, cancellation, and upstream errors. **Plan coverage:** “Every `tools/call`” in MCP protocol testing. **Done when:** adding or changing any registered tool without a complete MCP case fails CI.

- [ ] **Fix repeated same-field search filters.** Search filters are written into an object by field name, so a later filter for the same field overwrites the earlier one instead of producing repeated query parameters. Define AND/OR semantics and append all supported values. **Plan coverage:** semantic catalogue search correctness. **Done when:** exact request tests cover repeated same-field filters, mixed fields, and stable ordering.

- [ ] **Make bundle and bitstream pagination lossless.** `list_item_files()` reads only page zero up to the maximum page size for bundles and each bundle's files. It reports truncation but exposes no continuation mechanism, and `get_item_text()` may miss a valid text bitstream on a later page. Traverse bounded pages internally or expose explicit continuation inputs while retaining total-item/byte limits. **Plan coverage:** bundle discovery, file access, item handling, and complete content retrieval. **Done when:** every omitted file remains retrievable and text selection continues safely across pages.

- [ ] **Make access and content-link behavior fail closed.** Unknown or malformed access states must not be treated as reusable/public, and restricted/embargoed/withdrawn files should not receive usable content links unless the approved policy explicitly permits them. Keep access status separate from content-rights status. **Plan coverage:** 100% restricted/unavailable-content handling and safe authenticated-endpoint behavior. **Done when:** unknown, restricted, embargoed, and withdrawn fixtures cannot produce affirmative public-read claims or inappropriate content links.

- [ ] **Use a reviewed allowlist for inline binary MIME types.** Signature checks cover a few types but return success for unknown MIME types, allowing active HTML, SVG, XML, scripts, or complex formats to be returned as inline blobs. Inline only explicitly reviewed passive formats; use metadata and a canonical download link for active, unknown, and large formats. **Plan coverage:** content safety and “never execute embedded scripts, macros, links, or commands.” **Done when:** active/unknown formats cannot be delivered inline and all allowed formats require declared/detected-type agreement.

- [ ] **Implement true bounded/range-aware content retrieval or explicitly revise the streaming requirement.** `get_item_text()` streams network chunks into memory but downloads and decodes the complete text bitstream before slicing the requested character range. Binary resource reads also buffer the complete file up to the inline cap. Use reliable byte ranges/streaming where supported, or define separate whole-download ceilings and document that chunking controls model output rather than upstream bandwidth/memory. **Plan coverage:** streaming for files/large text and large-text resilience. **Done when:** first-chunk retrieval has predictable bounded network and memory behavior, or the plan/docs explicitly accept and test the bounded whole-file design.

- [ ] **Add the three planned semantic registry tools.** `list_metadata_schemas`, `list_metadata_fields`, and `list_bitstream_formats` are listed in the plan but are not among the 23 registered tools. They are reachable only through the raw endpoint escape hatch. Implement them with normalized, paginated outputs or record an explicit approved plan change explaining why raw access is sufficient. **Done when:** the tools and MCP tests exist, or the implementation plan and tool inventory consistently remove them.

- [ ] **Complete the planned MCP resource surface or record a deliberate scope reduction.** Implemented templates cover bitstream metadata/content and item text, plus the endpoint catalogue. Planned resources for `nla://item/{uuid}`, `nla://item/{uuid}/metadata`, `nla://community/{uuid}`, and `nla://collection/{uuid}` are absent. Add them with bounded output and tests, or amend the plan to state that semantic tools are the supported representation for those objects. **Done when:** documentation, `resources/templates/list`, and protocol tests match the approved URI surface exactly.

- [ ] **Complete fixture-based contract coverage.** There is no `fixtures/nla/` corpus, and contract tests cover only search and raw API behavior with inline mocks. Add sanitized, versioned fixtures and contract tests for the API root, facets, browse, communities, collections, items, bundles, text, original PDFs, and `401`, `403`, `404`, `429`, and `5xx` responses. Verify unknown-field preservation and detect silent normalizer data loss. **Plan coverage:** Phase 2 and contract-test plan. **Done when:** all named fixtures have explicit parsing/mapping assertions and drift updates are reviewable.

- [ ] **Complete the live integration acceptance list.** The four live tests prove root/search, a known item, bundles, the 83 KB text extraction, a PDF link, registry equality, and one raw read. They do not verify community/collection listing, collection-scoped search, a non-empty original-file response, PID object-type resolution, or protected `/core/items` behavior as required by the plan. Add stable low-cost live checks without asserting mutable counts. **Done when:** the nightly suite covers every listed live acceptance behavior and distinguishes upstream outage from product regression.

- [ ] **Make endpoint access drift conclusive.** The live root currently matches all 80 relations and reports no changed access classifications, but the 2026-07-14 access run skipped 16 relations because their base URLs returned validation, not-found, or upstream errors. Add relation-specific safe probes/required parameters, record expected indeterminate states, and decide whether unresolved probes fail or visibly degrade the nightly gate. **Done when:** every relation is either conclusively classified or has an approved explicit “not safely probeable” rule; accidental skipped coverage cannot produce a clean report.

- [ ] **Demonstrate real hosted HTTP compatibility.** Deterministic HTTP protocol tests pass, while the real-client script verifies stdio only. Deploy an authenticated or private test endpoint with TLS, then connect Codex, Claude, and MCP Inspector to the same `/mcp` endpoint and record initialization, tool/resource use, independent stateless requests, and shutdown. **Plan coverage:** Phase 6 acceptance criterion. **Done when:** same-revision evidence exists for all three clients and production deployment guidance reproduces it.

- [ ] **Add the missing security and concurrency tests from the plan.** Current tests cover many URL, Host/Origin, body-size, filename, redaction, and prompt-text cases, but not slow responses/bodies, infinite pagination, cancellation while queued, cache-limit bypass, cache stampede, concurrent limit bypass, active-content MIME policy, or shutdown during active requests. The optional `save_file` symlink case is not required while that tool remains absent. **Done when:** all applicable cases in Section 11 have deterministic CI coverage and adversarial failures preserve bounded resources.

- [ ] **Add performance and resilience benchmarks before setting release targets.** No automated suite measures concurrent searches, large metadata/text, upstream latency spikes/`429`, cache stampede, outage recovery, active-request shutdown, or model-output/token budgets. Establish representative workloads, capture baselines, and set evidence-based thresholds. **Plan coverage:** performance/resilience testing and eval metrics. **Done when:** release reports show bounded memory/concurrency and agreed latency/output targets under normal and degraded conditions.

## P2 — Medium priority

- [ ] **Adopt runtime schemas for untrusted DSpace objects.** Several mappers validate selected discriminator fields and then cast the remaining object to a rich TypeScript type. Define reusable schemas for metadata values, DSpace objects, bitstream formats, access status, checksums, pagination, and consumed HAL embeddings while preserving permitted unknown fields. **Plan coverage:** malformed-response detection, metadata fidelity, and contract drift. **Done when:** malformed nested values fail before influencing access, MIME, links, or output.

- [ ] **Validate or remove every nested upstream link before returning it.** Top-level HAL links used by the server are validated, but nested object `_links` can be copied into normalized/tool output. Recursively validate them, reconstruct canonical links, or omit them from semantic output. **Done when:** no returned semantic result contains an unvalidated external, private, credentialed, or non-HTTPS link.

- [ ] **Make queued work cancellable and dispose redirect/retry bodies.** Abort signals apply after a request acquires the semaphore, but a queued caller cannot cancel its wait. Redirect and retry responses are not explicitly cancelled or drained before continuing. Add abort-aware acquisition and response-body disposal. **Plan coverage:** abort propagation, bounded concurrency, graceful cancellation, and resilience. **Done when:** cancellation tests cover queued, backoff, redirect, and streaming states without later fetches or retained slots/sockets.

- [ ] **Strengthen pagination validation.** Page metadata currently accepts any finite non-negative number, including fractions, although downstream contracts expect integer counts and indexes. Require safe non-negative integers and sensible relationships without rejecting legitimate empty results. **Done when:** fractional, unsafe, and contradictory page fixtures fail deterministically.

- [ ] **Add a safe unexpected-error boundary.** Known `NlaError` values are actionable, but unexpected exceptions return their original message to MCP clients and are not correlated with a sanitized tool-level log. Return a stable generic error with a correlation ID and log the original only through redaction. **Plan coverage:** actionable errors without opaque stacks or information leakage. **Done when:** injected secrets, paths, and dependency messages never appear in client output but remain traceable to an operator event.

- [ ] **Implement plan-level tool observability.** Upstream request logs include status, retries, bytes, duration, and cache state, but the server does not consistently log tool name, tool duration, result count, truncation, and tool error category. Add a transport-neutral tool wrapper and optional metrics adapter while continuing to omit queries and document content. **Plan coverage:** Section 13 observability. **Done when:** operators can measure calls/errors/latency/output pressure per tool without collecting user content.

- [ ] **Expand package-boundary and container verification.** Release checks inspect the tarball and the release workflow health-checks a built image, but CI does not install the packed artifact into a clean project and invoke `nla-mcp` from another working directory. Add that test, build/scan the exact runtime image before release, and verify compose restrictions. **Done when:** only published files are sufficient for stdio and HTTP startup and the exact image digest has passing runtime, SBOM, licence, and vulnerability evidence.

- [ ] **Make the real-client/eval baseline reproducible and current.** Record client versions, explicit model identifiers where possible, clean server commit, transport, config, full result summaries, and cost/token methodology. Rerun whenever tool schemas, descriptions, defaults, SDK, or clients change. **Done when:** the committed baseline can be compared meaningfully between releases and never represents a dirty or different revision.

- [ ] **Finish release-consumer metadata and support channels.** Add canonical `repository`, `homepage`, `bugs`, author/contributor, and monitored support/security fields to package metadata after the project identity is approved. Verify that README installation examples use the actual published package/image and that support/private reporting links work. **Done when:** a registry or container consumer can locate source, issues, documentation, security reporting, and version provenance without repository-local context.

## P3 — Low priority

- [ ] **Audit every tool description against the plan's description checklist.** Ensure each states when to use it, accepted identifier form, possible output size, preceding/following tool, read-only status, and whether returned text is untrusted. Keep descriptions concise enough for model selection and test important wording.

- [ ] **Either remove dormant file-write configuration or implement the optional feature under a separate review.** `NLA_ENABLE_FILE_WRITES` and `NLA_DOWNLOAD_DIR` are parsed although no `save_file` tool exists. Because `save_file` was optional, absence is not a plan failure; the current settings should nevertheless be removed to avoid implying support, or the feature should receive its full path/symlink/overwrite/streaming security design before implementation.

- [ ] **Document deliberate deviations from proposed structure and defaults.** The implementation centralizes tools in `register-tools.ts`, omits `metrics.ts`, and uses an 8,000-character default text chunk rather than the plan's approximate 20,000. These may be valid choices; record them as accepted architecture decisions so future reviews distinguish intentional changes from unfinished work.

- [ ] **Use the MCP Inspector as a recorded neutral-client gate.** The plan requires Inspector during development, but no result artifact is stored. Add a short release checklist or automated/manual evidence record for tool discovery, resource templates, representative calls, and HTTP/stdio behavior.

## Work explicitly deferred or optional in the plan

The following should not be treated as leftover work for the initial public-read release unless scope changes:

- Authenticated NLA access and the `authenticated-read` profile.
- Admin or mutation tools.
- Local PDF text extraction and OCR.
- The optional local-only `save_file` tool.
- Stateful HTTP sessions, SSE resumability, and server-side tasks.
- OAuth inside the MCP server when the endpoint remains local/private and external deployment controls satisfy the approved design.
- OpenTelemetry metrics, provided required structured operational logging is completed.

## Recommended execution order

1. Fix resource-link trust, cache enforcement/capacity, restricted-content behavior, and active MIME policy.
2. Add concrete output schemas and table-driven MCP tests for all tools.
3. Fix repeated search filters and lossless bundle/file pagination; define bounded content retrieval.
4. Complete contract fixtures, live acceptance cases, drift probes, cancellation, security, and resilience tests.
5. Add missing registry tools/resources or approve and document the reduced surface.
6. Complete tool-level observability and clean package/container consumer tests.
7. Run hosted compatibility and the complete two-provider eval matrix on one clean revision.
8. Close legal/compliance release gates, activate the canonical repository, and publish through the verified release workflow.

## Verification performed for this review

- `npm run ci`: passed outside the restricted sandbox; formatting, lint, typecheck, release metadata, dependency licences, 144 deterministic tests, and build passed. Four opt-in live tests were skipped by the deterministic run as designed.
- `NLA_LIVE_TESTS=true npm test -- tests/integration/live.test.ts`: 4/4 live tests passed on 2026-07-14.
- `NLA_DRIFT_CHECK_ACCESS=true npm run drift:check`: 80 registry relations matched 80 advertised relations; no added, removed, moved, or changed-access relations were reported; 16 access probes were skipped.
- npm registry lookup for `@nla-am/nla-mcp`: `E404` on 2026-07-14.
- Git release state: no remote and no tags were configured in this checkout.
- Source, configuration, tests, eval corpus/baseline, documentation, Docker/Compose files, and CI/nightly/release workflows were compared with all sections and acceptance criteria in `IMPLEMENTATION_PLAN.md`.

## Completion decision

**Current status: implementation-rich prerelease, not plan-complete.** The core user journey works against the live NLA repository, but the P0 release gates and the protocol/eval/test evidence above must be completed before marking the implementation plan finished.
