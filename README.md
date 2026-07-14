# National Library of Armenia MCP

A provider-neutral, read-only Model Context Protocol server for the National Library of Armenia's DSpace 9 repository.

The current implementation includes:

- Strict TypeScript foundation with the stable official MCP SDK, validated configuration, JSON stderr logging, and stdio transport.
- A bounded NLA HTTP/HAL client with same-origin enforcement, cancellation, timeouts, safe redirects, retry/backoff, response limits, conditional caching, actionable errors, and metadata normalization.
- Agent-friendly search, facets, browse, hierarchy, item, and identifier tools with structured output and provenance.
- Bundle classification, verified bitstream metadata/download links, bounded NLA-provided text extraction, and `nla://` text/small-binary resources.
- A validated catalogue of every API-root relation, controlled JSON/plain-text raw reads, and live root-drift detection.
- Provider-neutral stdio and stateless Streamable HTTP transports with Host/Origin checks, rate limits, request-size limits, and health probes.
- A multilingual/adversarial eval corpus, scored cross-provider release gates, and ephemeral real-client compatibility checks for Codex CLI and Claude Code.

Local extraction/OCR remains outside the current server scope.

## Requirements

- Node.js 24 (the repository pins `24.15.0` for asdf)
- npm

## Setup

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

To run the remote transport locally:

```bash
MCP_TRANSPORT=http npm start
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`. Liveness and readiness are exposed separately at `/healthz` and `/readyz`. The HTTP profile is stateless: each request receives a fresh MCP server/transport while the bounded NLA client and cache are shared.

## Client configuration

After building, a local Codex/Claude-style stdio configuration can invoke:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/nla-mcp/dist/index.js"]
}
```

For package consumers, the CLI binary is `nla-mcp`.

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

Content resource templates are:

- `nla://bitstream/{uuid}` for bitstream metadata.
- `nla://bitstream/{uuid}/content` for bounded text or small binary content.
- `nla://item/{uuid}/text` for complete extracted text only when it fits the configured text limit.

The static `nla://api/endpoints` resource contains the complete validated endpoint catalogue. Prefer the semantic tools above. Use `get_api_capabilities` to inspect coverage and `nla_api_get` only for approved read endpoints that do not have a suitable semantic tool. The raw tool accepts only API-relative paths, `GET`/`HEAD`, bounded queries, and JSON or plain-text responses; it rejects mutation methods, arbitrary hosts, caller headers, traversal, and bitstream content.

Use `get_item_text` with `offset_chars` for larger text. Original PDFs are represented by standard MCP resource links and canonical HTTPS download URLs; binaries larger than `NLA_MAX_INLINE_BINARY_BYTES` are never base64-encoded into model context. See `docs/content-access.md`.

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

## Configuration

See `.env.example`. The most important security boundary is the pair:

```text
NLA_API_BASE_URL=https://api.nla.am/server/api
NLA_ALLOWED_HOST=api.nla.am
```

All followed links and redirects must remain HTTPS on that exact host and under the configured API base path. File writes are disabled and are not implemented by this server.

HTTP deployments also require explicit Host and Origin allowlists. Requests without an `Origin` header remain valid for native MCP clients; supplied origins must match exactly. `X-Forwarded-For` is ignored unless `MCP_TRUST_PROXY=true`, which should only be enabled behind a trusted proxy that sanitizes the header.
