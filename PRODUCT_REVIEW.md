# Product and User Value Review

Review date: 2026-07-14

Reviewed revision: `83e0f03f7968ae3720e928a17df0485d2e7e266f`

## Executive assessment

The project is a technically strong pre-release. It solves a meaningful problem: an AI client can use one provider-neutral, read-only interface to search the National Library of Armenia catalogue, inspect records, read available extracted text in bounded chunks, and obtain verified links to original files. The security boundaries, provenance, multilingual intent, live API drift detection, release automation, and operational documentation are unusually mature for this stage.

The core path is functional today. During this review, the live suite successfully searched NLA, resolved the known record `123456789/10740`, read the first 20,000 characters of its 83 KB NLA-provided text extraction, found its public original PDF, and confirmed that all 80 registered API-root relations still match the live service.

The product is not yet generally consumable, however. Its primary README installation command points to an npm package that currently returns `404`, there is no release tag, and this checkout has no Git remote configured. As a result, the practical value is presently limited to a developer who has the source tree. The next product milestone should be a verified public release and evidence that real agents consistently complete the intended research tasks—not more feature breadth.

| Dimension             | Current assessment                                                            |
| --------------------- | ----------------------------------------------------------------------------- |
| Core user value       | Real and demonstrated on a narrow live path                                   |
| Availability          | Blocked for normal `npx` users                                                |
| Ease of adoption      | Source setup works, but the advertised primary path does not                  |
| Task quality evidence | Corpus exists; release-level agent results do not                             |
| Trust and safety      | Strong overall, with cache-boundary and rights-context work remaining         |
| Production operations | Well designed in the repository, but not active without a hosted remote       |
| Product clarity       | Technically detailed; user outcomes and limitations need clearer presentation |

## Severity definitions

- **Critical (P0):** prevents users from receiving the product's core value or blocks a responsible release.
- **High (P1):** can make a core journey unreliable, misleading, unsafe, or unsuitable for production.
- **Medium (P2):** materially reduces usability, adoption, maintainability, or operator confidence.
- **Low (P3):** polish or completeness work that improves discovery and long-term quality.

## Critical — P0

- [ ] **Publish and verify an installable release.** The documented `npx -y @nla-am/nla-mcp@1` path currently fails because `@nla-am/nla-mcp@1.0.0` is not present in the public npm registry. There is also no `v1.0.0` tag. Configure the intended package scope and release credentials, create the signed release tag, publish npm/GHCR/GitHub release artifacts, and then run the README flow from a clean machine. **Done when:** both Codex and Claude can install the exact published version, search NLA, read extracted text, and obtain an original-file link without using the source checkout.

## High — P1

- [ ] **Establish the authoritative repository and activate the automation already built.** This checkout has no Git remote, and package metadata does not identify a canonical hosted repository, so users cannot verify that CI, nightly live/drift checks, Dependabot, private vulnerability reporting, releases, or the referenced issue tracker are active. Configure the canonical repository, branch protection, Actions, Dependabot alerts/security updates, support channel, and private security reporting. **Done when:** the default branch is protected by the documented gates, a scheduled nightly run is visible, and README/SECURITY links take users to working support destinations.

- [ ] **Prove release-level user task quality on the current clean revision.** The recorded Codex/Claude baseline only calls `get_repository_info`, was captured on the older `e22b982` revision, and explicitly records a dirty worktree. It proves connectivity, not successful research. Execute all 22 multilingual and adversarial corpus cases with both provider families, review grounding and citations rather than relying only on tool selection, and retain the scored results. **Done when:** both families pass the documented release thresholds on the same clean release commit, with failures and model/client versions recorded.

- [ ] **Expand live coverage from the happy path to the advertised semantic surface.** The four live tests cover API identity/search, one known item, its files/text, endpoint drift, and one raw read. Facets, browse, community/collection traversal, collection-scoped search, access status, identifier variants, resource reads, and restricted/error journeys are not checked live. Add a small, stable set of live probes and a packed-package MCP smoke test. **Done when:** each core user journey has at least one live or release-time end-to-end check without relying on mutable counts.

- [ ] **Make cache hits obey the caller's response limit and representation.** `NlaClient` keys cache entries only by URL and returns cached bytes before applying `maxResponseBytes`; the key also omits request representation headers. A response cached under a larger allowance can therefore bypass a later smaller raw-read limit. Include relevant representation dimensions in the key and enforce the active byte cap on fresh, cached, and `304` responses. Also set an explicit total cache-byte budget rather than only an entry count. **Done when:** tests demonstrate that cache hits cannot exceed the current request limit and the maximum cache memory remains safely below the container/process budget.

- [ ] **Replace generic `data: unknown` output schemas with stable per-tool contracts.** All envelope tools currently advertise the same schema with an unconstrained `data` field. This weakens tool discoverability, client validation, compatibility guarantees, and the meaning of the claimed stable output contract. Define schemas for search results, normalized records, facets, hierarchy, files, text chunks, access status, identifiers, capabilities, and raw reads. **Done when:** every semantic tool's structured output validates against a specific schema and contract tests fail on accidental field removal or incompatible type changes.

- [ ] **Correct and lock the text-continuation contract across code and documentation.** The actual default is 8,000 characters and the returned field is `nextOffset`, but `docs/content-access.md` says 20,000 and the README smoke flow says `nextOffsetChars`. These inconsistencies can cause an agent or user to stop after the first chunk or send the wrong continuation. Choose one public field vocabulary, update all docs/descriptions/examples, and add documentation assertions. **Done when:** README, content guide, eval guide, schemas, examples, and tests agree on the default, cap, return field, and `offset_chars` continuation input.

- [ ] **Distinguish public access from permission to reuse.** A publicly readable bitstream is not necessarily public-domain or licensed for unrestricted reuse. Normalize and expose rights, license, rights-holder, and embargo information where NLA provides it; add an explicit warning when reuse rights are unknown. **Done when:** user-facing results and documentation never imply that download access grants reproduction or commercial-use rights.

- [ ] **Define a safe hosted-product profile before advertising public/shared deployment.** The HTTP server is intentionally unauthenticated and its in-memory rate limits are per process. Either position it clearly as local/private-network infrastructure, or add gateway authentication, service-wide quotas, abuse monitoring, and an operator runbook before exposing it publicly. **Done when:** deployment documentation names the supported trust model, and a public deployment cannot anonymously generate unbounded distributed load against NLA.

- [ ] **Measure how often the product can deliver full text, not just metadata.** Text reading depends on an NLA-provided `TEXT` bundle; local PDF extraction and OCR are out of scope. Without coverage data, users cannot know how often the headline “read documents” journey will work. Sample representative collections and languages, report the proportion with public originals and usable text, and use the result to decide whether PDF extraction/OCR belongs on the roadmap. **Done when:** README or product documentation quantifies expected coverage and clearly describes the fallback experience.

- [ ] **Clarify ownership, official status, and accountable maintenance.** The `@nla-am` scope and product name may be read as official NLA endorsement, while package metadata has no author, repository, homepage, bugs URL, or maintainer contact. State whether this is an official NLA service, an independent integration, or a community project; obtain branding approval where applicable. **Done when:** users can identify the responsible maintainer, source repository, support route, security contact, and relationship to NLA before installing.

## Medium — P2

- [ ] **Rewrite the top of the README around user outcomes and a copyable first session.** The current introduction leads with a long implementation inventory. Add a short “what you can do” section, three representative English/Armenian/Russian prompts, expected result shapes, limitations, and a troubleshooting path. Keep architectural detail below the first successful journey. **Done when:** a first-time user can understand the value and reach a grounded NLA result without reading the implementation plan.

- [ ] **Make search facets and filters self-explanatory.** `filters[].field` and `sort` are free-form strings tied to DSpace conventions, while facet responses are largely upstream-shaped. Normalize available facet names/values/operators, document accepted sort forms, reject unsupported combinations with actionable guidance, and add examples for author, subject, year, language, and collection scope. **Done when:** an agent can refine a query using only semantic tool outputs, without prior DSpace API knowledge.

- [ ] **Close or explicitly defer the user-facing scope left in the implementation plan.** Planned metadata-schema, metadata-field, and bitstream-format tools are absent, as are item/community/collection metadata resources. Decide which are necessary for users versus only advanced API exploration; implement the valuable subset and mark the rest as deferred rather than implicitly complete. **Done when:** the implementation plan, README capability list, and actual `tools/list`/`resources/list` surface agree.

- [ ] **Make health semantics accurate and useful.** `get_repository_info` says it verifies server health but returns configured capabilities without contacting NLA; it can report `status: ok` during an upstream outage. Rename the meaning to server/configuration status or add bounded upstream reachability and freshness fields. **Done when:** users and agents can distinguish “MCP process is running” from “NLA is reachable” without interpreting deployment-only endpoints.

- [ ] **Define product performance budgets and measure them.** File listing can require multiple upstream calls per bundle/bitstream, and text continuation may repeatedly traverse item/file metadata even when content is cached. Record cold/warm latency and upstream-call counts for search, item details, files, first text chunk, continuation, and common failure cases. Optimize only against those measurements. **Done when:** release checks or baselines expose P50/P95 targets and regressions for the core flow.

- [ ] **Document user data flow and retention expectations.** Explain that queries and identifiers are sent to NLA, local stdio logs omit query strings and content, cache entries are in memory, and a remote operator can observe transport metadata. Add a concise privacy section for local and hosted modes. **Done when:** an adopter can determine what leaves their machine, what is retained, and who operates each dependency.

- [ ] **Add a lightweight feedback and product-success loop.** Define success measures such as install completion, time to first grounded record, task completion by language, citation validity, no-text fallback rate, and common structured error codes. Prefer opt-in/manual reporting for the local privacy-preserving product. **Done when:** roadmap decisions can be based on user outcomes rather than implementation completeness alone.

## Low — P3

- [ ] **Improve distribution metadata and discovery.** Add `repository`, `homepage`, `bugs`, maintainer/author, and relevant `keywords` fields to `package.json`; ensure the npm and container pages link back to the same canonical documentation and security policy.

- [ ] **Remove or clearly label dormant file-write configuration.** `NLA_ENABLE_FILE_WRITES` and `NLA_DOWNLOAD_DIR` are accepted even though no save-file feature exists. Remove them until implementation or label them as reserved and reject enabling the unsupported behavior with a direct message.

- [ ] **Provide an Armenian quick-start.** The corpus demonstrates Armenian intent, but all onboarding and operator documentation is English. Add at least a concise Armenian installation, example-prompt, limitations, and support page, then have a native speaker review terminology.

- [ ] **Add issue templates for support-quality inputs.** Provide bug, upstream outage, and feature-request templates that request the already documented sanitized fields while explicitly warning users not to attach credentials or full document text.

## Recommended delivery order

1. Publish a real release and activate the canonical repository.
2. Fix contract correctness: cache limits, per-tool output schemas, and text-continuation documentation.
3. Run the full cross-provider task evaluation and broaden live journey coverage.
4. Resolve trust questions: rights/reuse, hosted authentication posture, ownership, and privacy.
5. Improve discovery/search ergonomics, measure content coverage and performance, then prioritize new capabilities from evidence.

## Evidence reviewed

- Product intent and completion criteria in `IMPLEMENTATION_PLAN.md`.
- User onboarding and claims in `README.md`, `docs/content-access.md`, `docs/deployment.md`, `docs/evals.md`, `docs/security.md`, and `docs/support.md`.
- Tool, resource, schema, client, cache, transport, security, release, and evaluation implementations under `src/`.
- Contract, protocol, security, compatibility, and live tests under `tests/`.
- The 22-case multilingual/adversarial corpus and recorded real-client compatibility baseline under `evals/`.
- Local release state: no Git tag and no configured Git remote.
- Public registry check: `@nla-am/nla-mcp@1.0.0` returned npm `E404` on 2026-07-14.
- Live NLA suite on 2026-07-14: 4/4 tests passed; 80/80 endpoint relations matched.
- Package dry run on 2026-07-14: build and tarball inspection succeeded.
