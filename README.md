# National Library of Armenia MCP

A provider-neutral, read-only Model Context Protocol server for the National Library of Armenia's DSpace 9 repository.

The current implementation includes:

- Strict TypeScript foundation with the stable official MCP SDK, validated configuration, JSON stderr logging, and stdio transport.
- A bounded NLA HTTP/HAL client with same-origin enforcement, cancellation, timeouts, safe redirects, retry/backoff, response limits, conditional caching, actionable errors, and metadata normalization.
- Agent-friendly search, facets, browse, hierarchy, item, and identifier tools with structured output and provenance.
- Bundle classification, verified bitstream metadata/download links, bounded NLA-provided text extraction, and `nla://` text/small-binary resources.
- A validated catalogue of every API-root relation, controlled JSON/plain-text raw reads, and live root-drift detection.

Streamable HTTP, local extraction/OCR, and deployment hardening belong to later phases.

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

## Client configuration

After building, a local Codex/Claude-style stdio configuration can invoke:

```json
{
  "command": "node",
  "args": ["/absolute/path/to/nla-mcp/dist/index.js"]
}
```

For package consumers, the CLI binary is `nla-mcp`.

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

## Configuration

See `.env.example`. The most important security boundary is the pair:

```text
NLA_API_BASE_URL=https://api.nla.am/server/api
NLA_ALLOWED_HOST=api.nla.am
```

All followed links and redirects must remain HTTPS on that exact host and under the configured API base path. File writes are disabled and are not implemented by this server.
