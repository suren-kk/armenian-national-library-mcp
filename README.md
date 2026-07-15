# National Library of Armenia MCP Server (unofficial)

An independent, provider-neutral, read-only research MCP integration for the National Library of Armenia's public DSpace 9 repository.

> [!IMPORTANT]
> This is an unofficial project by Suren Karapetyan. It is not affiliated with, endorsed by, sponsored by, or operated by the National Library of Armenia. The NLA name identifies the interoperated public repository only. The MIT License covers this project's software—not NLA metadata, extracted text, scans, publications, or other third-party material. See [Data and Content Rights](DATA_AND_CONTENT_RIGHTS.md) before using repository content.

## What you can do

- Find books, periodicals, manuscripts, and other catalogue records in Armenian, English, or Russian.
- Refine a search by author, subject, year, language, type, or collection without knowing the DSpace API.
- Inspect complete metadata, identifiers, hierarchy, access status, and source-declared rights evidence.
- Read NLA-provided extracted text in bounded chunks when a public `TEXT` bundle exists.
- Obtain a canonical NLA link for a public original file without placing a PDF or other complex document in model context.

Try one of these prompts after connecting the server:

- English: “Find works by Hovhannes Tumanyan, show the three most relevant records, and cite their NLA catalogue pages.”
- Հայերեն: «Գտիր Հովհաննես Թումանյանի ստեղծագործությունները, ցույց տուր երեք համապատասխան գրառում և նշիր ՀԱԳ-ի աղբյուրները»։
- Русский: «Найди материалы об истории Армении, уточни поиск по теме и покажи ссылки на записи библиотеки».

A grounded result should identify the NLA record, include its canonical catalogue URL, distinguish access from reuse permission, and say clearly when extracted text is unavailable. Tool responses consistently include `data`, `source`, `warnings`, `pagination`, and `truncated` fields.

## Current availability

Version `1.0.1` is available from npm as `@suren-kk/armenian-national-library-mcp`. Use the client commands below or the copyable [source setup](#build-from-source). See the [Armenian quick start](docs/quickstart-hy.md) for a concise Armenian-language walkthrough.

## How it works

The implementation includes:

- Strict TypeScript foundation with the stable official MCP SDK, validated configuration, JSON stderr logging, and stdio transport.
- A bounded NLA HTTP/HAL client with same-origin enforcement, cancellation, timeouts, safe redirects, retry/backoff, response limits, conditional caching, actionable errors, and metadata normalization.
- Agent-friendly search, facets, browse, hierarchy, item, and identifier tools with structured output and provenance.
- Bundle classification, validated bitstream metadata/access/download links, bounded NLA-provided text extraction, explicit MIME verification state, and `nla://` resources limited to UTF-8 text and verified raster images.
- A validated catalogue of every API-root relation, controlled JSON/plain-text raw reads, and live root-drift detection.
- Provider-neutral stdio and stateless Streamable HTTP transports with Host/Origin checks, rate limits, request-size limits, and health probes.
- A multilingual/adversarial eval corpus, scored cross-provider release gates, and ephemeral real-client compatibility checks for Codex CLI and Claude Code.

Local extraction/OCR remains outside the current server scope.

## Requirements

- Node.js 24 (the repository pins `24.15.0` for asdf)
- npm

## Install and connect a client

The npm package name is `@suren-kk/armenian-national-library-mcp`.

Add it to Codex:

```bash
codex mcp add nla -- npx -y @suren-kk/armenian-national-library-mcp
```

Equivalent Codex configuration:

```toml
[mcp_servers.nla]
command = "npx"
args = ["-y", "@suren-kk/armenian-national-library-mcp"]
startup_timeout_sec = 20
tool_timeout_sec = 60
```

Add the same package to Claude Code:

```bash
claude mcp add --transport stdio nla -- \
  npx -y @suren-kk/armenian-national-library-mcp
```

Restart or reconnect the client after adding the server. A new-user smoke flow is:

1. Search for an NLA record with `search_catalog`.
2. Pass its item identifier to `get_item_text` and pass the returned `nextOffset` value back as `offset_chars` when the text is chunked.
3. Review the record's rights and access fields. When access is public and your intended use is permitted, call `list_item_files` or `get_file_download` to obtain the canonical NLA URL.

Codex and Claude use the same binary, schemas, security policy, and NLA data. Only their client configuration commands differ.

If a search is too broad, call `get_search_facets` and apply an exact returned value as a filter. The [search and refinement guide](docs/searching.md) contains author, subject, year, language, sorting, and collection-scope examples.

## Build from source

```bash
npm install
cp .env.example .env
npm run ci
```

Build and start the stdio server:

```bash
npm run build
npm start
```

The server writes protocol messages only to stdout. Structured operational logs go to stderr.

If startup, connectivity, or an NLA request fails, use the decision tree in [Support and troubleshooting](docs/support.md). Do not post credentials, authorization headers, full extracted text, or file bytes in an issue.

To run the remote transport locally:

```bash
MCP_TRANSPORT=http npm start
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`. Liveness and readiness are exposed separately at `/healthz` and `/readyz`. The HTTP profile is stateless: each request receives a fresh MCP server/transport while the bounded NLA client and cache are shared.

## Other client configurations

After building, a local Codex/Claude-style stdio configuration can invoke:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/armenian-national-library-mcp/dist/index.js"]
}
```

The CLI binary and MCP server name are `nla-research-mcp`; a global installation can invoke that command directly.

A remote MCP client can connect to:

```json
{
  "url": "https://your-host.example/mcp"
}
```

Terminate TLS at a trusted reverse proxy in production and explicitly set `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS`. See the [deployment guide](docs/deployment.md).

## Tools

- `get_repository_info`
- `search_catalog`, `get_search_facets`, `browse_catalog`
- `list_communities`, `get_community`, `list_subcommunities`, `list_community_collections`
- `list_collections`, `get_collection`, `list_collection_items`
- `get_item`, `get_item_access_status`, `list_item_files`, `get_item_relationships`, `get_item_version`, `get_item_identifiers`
- `get_item_text`, `get_bitstream`, `get_file_download`
- `resolve_identifier`
- `get_api_capabilities`, `nla_api_get`

Identifiers accept a DSpace UUID, a handle such as `123456789/10740`, or a canonical `https://dspace.nla.am/handle/...` URL. Arbitrary URLs are rejected.

Every successful catalogue tool result uses a consistent envelope with `data`, `pagination`, `source`, `warnings`, and `truncated`. Upstream catalogue content is preserved as data, stripped of terminal control characters, and never included in server instructions.

Normalized item metadata preserves source-declared rights statements, rights URIs, rightsholders, access-rights fields, and licence fields when present. `rights.status: "unknown"` means no supported declaration was found. `rights.reusable` is always `null`: this software reports source evidence but does not decide that reuse is permitted. Technical public access and content reuse are separate questions.

Content resource templates are:

- `nla://bitstream/{uuid}` for bitstream metadata.
- `nla://bitstream/{uuid}/content` for bounded text or small binary content.
- `nla://item/{uuid}/text` for complete extracted text only when it fits the configured text limit.

The static `nla://api/endpoints` resource contains the complete validated endpoint catalogue. Prefer the semantic tools above. Use `get_api_capabilities` to inspect coverage and `nla_api_get` only for approved read endpoints that do not have a suitable semantic tool. The raw tool accepts only API-relative paths, `GET`/`HEAD`, bounded queries, and JSON or plain-text responses; it rejects mutation methods, arbitrary hosts, caller headers, traversal, and bitstream content.

Use `get_item_text` with `offset_chars` for larger text. Each text bitstream is downloaded as a whole under the dedicated `NLA_MAX_TEXT_BYTES` ceiling and then sliced into bounded Unicode chunks. Validator-backed decoded text is reused under the same byte-bounded cache policy for subsequent chunks. Original PDFs and other complex documents are represented by metadata and canonical HTTPS download URLs, never inline MCP content. Only bounded UTF-8 plain text and signature-matched PNG, JPEG, or GIF data can be returned inline; binaries larger than `NLA_MAX_INLINE_BINARY_BYTES` are never base64-encoded into model context. See `docs/content-access.md`.

## Tests

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Live smoke tests are opt-in so ordinary test runs remain deterministic:

```bash
NLA_LIVE_TESTS=true npm test -- tests/integration/live.test.ts
npm run drift:check
```

The live tests verify the API root, endpoint coverage, a controlled raw read, Discover search, known-handle resolution, bundle/bitstream enumeration, chunked access to the tested 83 KB extraction, and the associated original PDF link. They do not assert mutable repository counts. The drift command exits non-zero when a root relation is added, removed, or moved; set `NLA_DRIFT_CHECK_ACCESS=true` to also probe classified anonymous-access behavior.

See `docs/endpoint-coverage.md` for the matrix fields, security policy, and drift-check behavior.

The enforced runtime layering and dependency rules are documented in [Architecture](docs/architecture.md).

Provider-neutral eval and compatibility checks are available separately:

```bash
npm run eval:validate
npm run eval:score -- evals/results/codex.json evals/results/claude.json
npm run compat:clients
```

The real-client check uses the installed Codex and Claude clients' existing authentication and may incur provider usage; its temporary MCP definitions blank common provider credential variables for the server child. The search tool defaults to compact normalized results without duplicate raw metadata, and extracted text defaults to 8,000-character chunks. See the [eval and compatibility guide](docs/evals.md) for the corpus, result schema, gates, and recorded baseline.

Security and supply-chain checks are available separately because the advisory scan requires network access:

```bash
npm run security:licenses
npm run security:audit
npm run security:sbom > sbom.cdx.json
```

The SBOM command emits CycloneDX JSON for production dependencies. See the [security model](docs/security.md) for trust boundaries, mitigations, and residual risks.

## Container

The image uses a digest-pinned Node base, installs from the lockfile without lifecycle scripts, contains production dependencies only, and runs as a non-root user. Start the hardened local HTTP profile with:

```bash
docker compose up --build
```

The Compose profile publishes only on `127.0.0.1:3000` by default and applies a read-only root filesystem, dropped capabilities, no-new-privileges, a small temporary filesystem, and process/resource limits. Set the public Host/Origin allowlists and place a TLS reverse proxy in front before remote deployment. See the [deployment guide](docs/deployment.md).

Tagged releases also publish a versioned image to `ghcr.io/<repository-owner>/<repository-name>`. Use the exact image reference shown on the repository release page, verify its source revision label, and apply the same runtime restrictions as the Compose profile.

## Configuration

See `.env.example`. The most important security boundary is the pair:

```text
NLA_API_BASE_URL=https://api.nla.am/server/api
NLA_ALLOWED_HOST=api.nla.am
```

All followed links and redirects must remain HTTPS on that exact host and under the configured API base path. File writes are disabled and are not implemented by this server.

HTTP deployments also require explicit Host and Origin allowlists. Requests without an `Origin` header remain valid for native MCP clients; supplied origins must match exactly. `X-Forwarded-For` is ignored unless `MCP_TRUST_PROXY=true`, which should only be enabled behind a trusted proxy that sanitizes the header.

## Privacy in brief

Search text, identifiers, filters, and pagination needed for a request are sent to `https://api.nla.am`. Results may then be sent by your MCP client to the AI provider you configured. The server has no analytics or telemetry service; its bounded cache and rate-limit state are in memory, and its default logs omit queries and document content. A self-hosted HTTP operator and its reverse proxy can still observe transport metadata and define their own retention. Read the full [Privacy Notice](PRIVACY.md) before operating a shared endpoint.

## Releases and support

- [Changelog](CHANGELOG.md)
- [MIT software licence](LICENSE)
- [Unofficial status and notices](NOTICE)
- [Data and content rights](DATA_AND_CONTENT_RIGHTS.md)
- [Privacy notice](PRIVACY.md)
- [Rights, takedown, and correction requests](TAKEDOWN.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Contributing and provenance requirements](CONTRIBUTING.md)
- [Search and refinement guide](docs/searching.md)
- [Product scope and deliberate deferrals](docs/product-scope.md)
- [Performance budgets](docs/performance.md)
- [Text and original-file coverage methodology](docs/content-coverage.md)
- [Product success and feedback](docs/product-success.md)
- [Armenian quick start](docs/quickstart-hy.md)
- [Neutral-client and hosted acceptance gate](docs/client-acceptance.md)
- [Legal, privacy, and rights incident runbook](docs/legal-incident-response.md)
- [Release and artifact verification guide](docs/releasing.md)
- [Support and upstream outage runbook](docs/support.md)
- [Security reporting policy](SECURITY.md)
