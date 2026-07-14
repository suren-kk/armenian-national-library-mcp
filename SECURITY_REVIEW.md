# Security Review and Remediation Checklist

Review date: 2026-07-14

Reviewed revision: `83e0f03f7968ae3720e928a17df0485d2e7e266f`

## Executive assessment

The project has a strong security baseline for a pre-release MCP server. The outbound network boundary is fixed to the NLA HTTPS API, redirects and HAL links are constrained, raw reads use a registry allowlist, mutations and caller-controlled credentials are excluded, request and response sizes are bounded, logs avoid queries and redact sensitive fields, file writes are absent, workflow actions and the container base are digest-pinned, the runtime is non-root, and the Compose profile adds meaningful isolation.

No confirmed Critical vulnerability was found. Two High-severity boundary failures were directly reproduced:

1. A JSON object supplied by the untrusted upstream and shaped like a `resource_link` is promoted by the generic result walker into a real MCP resource link. A test payload using `file:///etc/passwd` appeared in the tool's resource-link content.
2. A response cached under a larger byte allowance is returned to a later request without enforcing that request's smaller limit. A cached 100-byte response was returned to a call capped at 4 bytes.

The public-read design limits confidentiality impact because the server has no NLA credentials and does not write files. The main residual risks are therefore client-side confused-deputy behavior, prompt injection, active-content handling, availability/resource exhaustion, unauthenticated hosted deployment, and supply-chain/operational drift.

| Security area       | Assessment                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| SSRF and redirects  | Strong fixed-host, HTTPS, base-path, and redirect controls                                                   |
| Authorization       | Safe anonymous read-only profile; hosted MCP endpoint has no client authentication                           |
| Prompt injection    | Clear data/instruction separation, but release-level agent resistance is unproven                            |
| Content handling    | Good size/UTF-8/signature checks; inline active MIME types are too permissive                                |
| Resource exhaustion | Good per-response limits; cache and concurrent HTTP request limits need hardening                            |
| Logging and secrets | Strong default redaction; unexpected tool errors can expose internal messages                                |
| Supply chain        | Strong pinning, lockfile, provenance design, SBOM, and automation; host and image scanning must be activated |
| Container isolation | Strong Compose defaults; egress and runtime image surface remain broad                                       |

## Severity definitions

- **Critical (P0):** directly exploitable compromise of confidentiality, integrity, authorization, or host execution under expected deployment conditions.
- **High (P1):** credible boundary bypass, confused-deputy path, production denial-of-service risk, or missing control required before public deployment.
- **Medium (P2):** defense-in-depth, validation, monitoring, or hardening weakness that materially increases exposure.
- **Low (P3):** security hygiene or assurance improvement with limited immediate exploitability.

## Critical — P0

No confirmed Critical vulnerability was identified during this review.

## High — P1

- [ ] **Prevent untrusted data from becoming MCP resource links.** `collectResourceLinks()` recursively treats any object with `type: "resource_link"`, `uri`, and `name` as a trusted link. This applies to raw API bodies and other upstream-derived fields. A mocked NLA JSON body produced a real `file:///etc/passwd` link in `nla_api_get` output. Remove generic recursive promotion and emit resource links only from server-created, typed fields. Validate permitted schemes and exact URI forms before adding MCP content. **Done when:** hostile `file:`, external HTTPS, custom-scheme, and nested fake resource-link objects remain inert serialized data, while generated `nla://bitstream/...` links still work.

- [ ] **Use an explicit allowlist for inline MIME types and deny active content.** Unknown binary MIME types currently pass signature validation, so small HTML, SVG, XML, JavaScript, Office/macro, or other active content can be returned as a blob with its upstream-declared MIME type. A client may render or open it outside the server's control. Inline only a minimal reviewed set, such as verified raster images and carefully handled plain text; return metadata and a canonical download link for active or complex formats. Add `X-Content-Type-Options: nosniff` where HTTP responses are applicable. **Done when:** HTML/SVG/scriptable documents and unknown types cannot be delivered inline, and allowlisted types require signature/MIME agreement.

- [ ] **Enforce byte limits on fresh, cached, and revalidated responses.** `NlaClient` checks limits while initially streaming a response but bypasses the current `maxResponseBytes` when returning a cache hit or `304`-validated entry. Enforce every caller's active limit before returning cached bytes and include representation-affecting headers in the cache key. **Done when:** cache hits cannot exceed raw-read, text, metadata, or inline-binary limits under any population order.

- [ ] **Add an aggregate cache-memory ceiling.** The cache bounds the number of entries but not total bytes. Default settings can retain roughly 256 MiB of payloads before runtime overhead, creating denial-of-service pressure inside the 512 MiB Compose limit. Track total bytes, evict by byte and entry limits, and expose conservative configuration bounds. **Done when:** worst-case cache memory is explicitly bounded and tested below a safe fraction of the process/container budget.

- [ ] **Do not expose the hosted HTTP profile without authentication and external abuse controls.** Host/Origin validation and in-process fixed-window limits are not user authentication and do not stop distributed abuse. Require an authenticated reverse proxy or MCP authorization implementation, distributed quotas, connection limiting, and TLS before internet exposure; otherwise enforce a local/private deployment profile. Never pass MCP tokens to NLA. **Done when:** a production deployment cannot anonymously amplify requests to NLA and the documented token issuer/audience/scope boundary is tested.

- [ ] **Bound concurrent connections, in-flight bodies, and slow requests.** The global rate limit counts accepted `/mcp` requests but does not cap simultaneous body buffers or active operations. At defaults, distributed clients can hold many requests, each with up to a 1 MiB body and a 120-second request timeout, competing with the container memory limit. Add server-level concurrency and per-IP connection caps, a shorter body-read deadline/minimum data rate, queue bounds, and proxy-level limits covering invalid paths and headers as well as MCP calls. **Done when:** load tests demonstrate bounded memory and event-loop responsiveness under slowloris, many-IP, oversized, malformed, and long-running request scenarios.

- [ ] **Run and enforce model-level prompt-injection gates on the release revision.** Unit tests verify that hostile text remains data and instructions remain static, but they do not prove that actual agents resist catalogue/OCR instructions. The recorded real-client baseline only calls the health tool and predates the reviewed commit. Execute all adversarial corpus cases with both provider families, review tool traces and final answers, and block release on any unsafe tool choice, false authority claim, or external-link following. **Done when:** both providers pass the prompt-injection, false-UUID, hostile-URL, restricted-content, and oversized-document gates on the same clean release commit.

- [ ] **Create a safe unexpected-error boundary.** Non-`NlaError` exceptions are returned to MCP clients using their original `Error.message`, which can disclose file paths, dependency details, or configuration. Log the original error only through redacted structured logging, attach a correlation ID, and return a generic stable internal-error response. **Done when:** injected exceptions containing secrets, paths, URLs, and stack information are absent from client output but traceable in sanitized operator logs.

- [ ] **Activate the canonical security-maintenance channel before release.** This checkout has no Git remote and package metadata identifies no repository, so the presence of workflow files does not prove that Dependabot alerts, security updates, pinned-action checks, nightly drift tests, private vulnerability reporting, branch protection, or advisory scans are operating. Establish the authoritative host and verify each control. **Done when:** protected CI and release environments are visible, a scheduled security/drift run succeeds, and users have a working private reporting route.

- [ ] **Scan the built container and release artifacts, not only npm dependencies.** `npm audit` currently reports zero vulnerabilities, but it does not cover Debian packages in the Node image, generated container layers, or malicious content in release artifacts. Add an image/filesystem scanner with a reviewed severity policy, generate an attestation, and scan the exact digest that will be published. **Done when:** release gates fail on disallowed OS/application CVEs and attach machine-verifiable scan/SBOM provenance to the published image.

## Medium — P2

- [ ] **Validate or remove nested upstream links before returning them.** Top-level HAL links are checked, but nested DSpace object `_links` are copied into normalized output without equivalent validation. Even when the server does not follow them, agents or clients may. Recursively validate NLA API links, replace them with constructed canonical links, or omit them from semantic outputs. **Done when:** no unvalidated external, local, credentialed, non-HTTPS, or out-of-base URL appears in a semantic tool result.

- [ ] **Use runtime schemas for every untrusted upstream structure.** Partial predicates followed by TypeScript casts leave metadata arrays, formats, access records, checksums, and nested fields unchecked. Adopt strict-enough passthrough schemas and reject malformed shapes before they influence resource links, MIME decisions, access claims, or output. **Done when:** fuzzed and malformed upstream records cannot create inconsistent security-relevant fields.

- [ ] **Treat access status as authoritative and fail closed on unknown values.** `publiclyReadable` is derived from the exact string `open.access`, while a download URL and resource link are still returned for all statuses. Define a reviewed access-status mapping, mark unknown states non-public, and consider omitting content links for restricted/unknown records. **Done when:** unknown, missing, malformed, embargoed, and restricted statuses never produce an affirmative public-access claim or inline content.

- [ ] **Harden filename and display-text spoofing controls.** Filename validation blocks paths and C0 controls but accepts bidirectional overrides, zero-width characters, and other Unicode format controls that can disguise extensions or display order. Preserve research text where required, but reject or visibly escape dangerous filename controls and include the trusted MIME type separately. **Done when:** bidi/zero-width filename fixtures cannot visually masquerade as another file type.

- [ ] **Strengthen MIME verification and separate “verified” from “declared.”** Signature checks cover PDF, PNG, JPEG, and GIF only and return success for every other MIME type. Track declared MIME, detected type, and verification status separately; fail closed for inline content when they conflict. Do not describe unverified types as verified. **Done when:** polyglot, truncated, mislabeled, and unknown files have explicit safe handling and tests.

- [ ] **Cancel or drain response bodies before redirects and retries.** Retryable and redirect responses are abandoned without explicitly canceling their body streams. Under repeated failures this can consume sockets and memory, becoming an availability issue. Cancel bodies before continuing and add cancellation-aware semaphore acquisition. **Done when:** adversarial redirect/retry tests leave no queued work or retained connection resources.

- [ ] **Bound rate-limiter identity state.** The per-client map is cleared on a global-window rollover but can grow with every unique client identity up to the configured global limit, which permits values as high as one million. Add a strict identity-cap/eviction policy and keep production limits conservative. **Done when:** high-cardinality source tests show constant bounded memory.

- [ ] **Apply coarse rate and connection controls to every HTTP route.** Invalid Host/Origin requests, unknown paths, preflights, health, and readiness are outside the MCP limiter. Keep orchestrator probes reliable, but protect all public parsing/response paths at the proxy or server with suitable independent limits. **Done when:** unauthenticated traffic cannot bypass every availability control by changing only path or headers.

- [ ] **Enforce network egress outside the Node process.** Application URL policy is strong, but a compromised runtime could bypass it and open arbitrary sockets. Use a container/orchestrator egress policy or proxy allowing only required DNS and NLA HTTPS destinations, with explicit update procedures for NLA addresses. **Done when:** a compromised-process test cannot reach loopback services, cloud metadata, private networks, or arbitrary internet hosts.

- [ ] **Add property-based and fuzz testing for security parsers.** URL, raw-path, percent-decoding, Host, Origin, identifier, filename, HAL-template, pagination, and content-length parsers have strong examples but no generative coverage. Add bounded fuzz/property suites for encoding layers, Unicode separators, IPv4/IPv6 variants, userinfo, malformed headers, and parser differentials. **Done when:** security parsers maintain invariants over generated adversarial inputs in CI.

- [ ] **Require request media types and protocol headers explicitly.** The HTTP transport parses POST bodies as JSON regardless of `Content-Type`. Enforce appropriate MCP content/protocol headers, return `415` for unexpected media types, and test charset/duplicate-header cases. This reduces ambiguous parsing and cross-protocol behavior. **Done when:** only documented MCP request representations reach the SDK handler.

- [ ] **Add security-focused observability without collecting user content.** Track authentication decisions, Host/Origin rejection, rate-limit scope, active requests, request-size rejection, upstream failures, cache pressure, redirects, and security error codes. Alert on sustained anomalies while continuing to omit search terms, metadata, and document text. **Done when:** an operator can detect abuse and boundary failures without sensitive payload logging.

- [ ] **Adopt keyless trusted publishing where possible.** The release workflow uses a long-lived `NPM_TOKEN` even though it also requests an OIDC identity token for provenance. Prefer npm trusted publishing and short-lived identities, protect the release environment, and document emergency rotation/revocation. **Done when:** routine releases require no long-lived registry secret.

- [ ] **Sign container and release attestations.** Checksums and npm provenance are valuable, but consumers do not receive a unified signature for the image digest, SBOM, source revision, and release manifest. Add keyless signing/attestation and verification instructions. **Done when:** users can cryptographically verify that npm, container, SBOM, and source artifacts correspond to the same reviewed commit.

- [ ] **Minimize the runtime image.** The runtime stage retains the full slim Node userspace and npm-related package metadata. Evaluate a smaller hardened Node/distroless runtime, remove unnecessary executables/package managers, and preserve non-root/read-only operation and health checks. **Done when:** the published image contains only runtime necessities and passes the same protocol/container tests.

- [ ] **Plan isolation for any future authenticated profile.** The shared cache and client are safe only because all current data is anonymous/public. Before adding NLA credentials or per-user authorization, partition caches by authorization context, prevent token forwarding, add scope/audience validation, and threat-model cross-user leakage. **Done when:** authenticated data can never populate or be served from the public cache/profile.

## Low — P3

- [ ] **Remove dormant file-write settings.** `NLA_ENABLE_FILE_WRITES` and `NLA_DOWNLOAD_DIR` are accepted although no write tool exists. Removing them reduces misleading attack surface; any future write feature should receive a separate threat model and profile.

- [ ] **Add standard API security headers.** Set `X-Content-Type-Options: nosniff`, a restrictive `Content-Security-Policy` where meaningful, `Referrer-Policy`, and proxy-managed HSTS for HTTPS deployments. Confirm that MCP clients remain compatible.

- [ ] **Add repository secret scanning and static analysis.** Enable push protection/secret scanning where available and add a focused CodeQL or equivalent SAST workflow. Keep findings reviewed rather than automatically suppressing generated noise.

- [ ] **Document security incident response.** Add ownership, severity/triage targets, token and release revocation, compromised-package/image response, NLA coordination, and user-notification steps to the private maintainer runbook.

- [ ] **Schedule periodic threat-model review.** Revisit the model whenever MCP SDK/spec behavior, transports, authentication, content extraction/OCR, writable tools, deployment exposure, or NLA endpoint access changes.

## Recommended remediation order

1. Remove generic resource-link promotion and add hostile-link regression tests.
2. Deny inline active/unknown content and make MIME verification explicit.
3. Fix cache limit enforcement and aggregate memory bounds.
4. Add safe error handling and validate/strip nested upstream links.
5. Harden HTTP authentication, concurrency, slow-body, and distributed rate boundaries.
6. Run the full cross-provider adversarial evaluation on the release commit.
7. Activate repository security automation and add image scanning/attestation.
8. Add egress controls, fuzzing, metrics, and remaining defense-in-depth work.

## Evidence reviewed

- Security model and reporting policy in `docs/security.md` and `SECURITY.md`.
- URL, raw-path, Host/Origin, rate-limit, response-limit, sanitizer, filename, MIME, logging, cache, transport, resource, and tool-result implementations under `src/`.
- Security, protocol, contract, unit, compatibility, evaluation, and live tests under `tests/`.
- Dockerfile, Compose restrictions, endpoint registry, GitHub workflows, Dependabot configuration, lockfile, release scripts, and SBOM/provenance design.
- Reproduction: an untrusted raw JSON object created an MCP `resource_link` with URI `file:///etc/passwd`.
- Reproduction: a 100-byte cache entry bypassed a later `maxResponseBytes: 4` limit.
- Dependency advisory scan on 2026-07-14: zero known vulnerabilities reported by npm.
- Full deterministic CI on 2026-07-14: 144 tests passed, 4 live-only tests skipped, with lint, typecheck, license, release, and build gates passing.
- Live NLA verification on 2026-07-14: 4/4 smoke tests passed and all 80 API-root relations matched the registry.
