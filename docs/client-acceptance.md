# Neutral-client and hosted acceptance gate

The deterministic protocol suite proves the MCP contract in memory and over local Streamable HTTP. Before a public release or shared hosted deployment, retain same-revision manual evidence from Codex, Claude, and the MCP Inspector. This gate does not authorize a public endpoint: use a TLS-protected private test deployment that follows `docs/deployment.md`.

## Test matrix

Run every client against both the packed stdio executable and the same authenticated/private `/mcp` endpoint.

| Journey                 | Required evidence                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Initialize and discover | Client/version, transport, server commit, protocol initialization, 23 tools, static resources, and resource templates           |
| Search and refine       | `search_catalog`, `get_search_facets`, one returned filter value, grounded canonical NLA record URL                             |
| Metadata and rights     | `get_item`, preserved provenance, rights evidence, and the unknown-rights warning when applicable                               |
| Text continuation       | First `get_item_text` chunk, returned `nextOffset`, and a second call using `offset_chars`                                      |
| Original file           | `list_item_files` followed by a canonical public NLA URL, with no PDF/complex bytes placed in model context                     |
| Resource read           | Bitstream metadata and one allowed bounded content resource where available                                                     |
| Restricted/error path   | Authentication-required or unavailable content remains unavailable and returns a safe structured error                          |
| Stateless HTTP          | Independent initialized requests succeed without relying on server-side session state; invalid bearer/Host/Origin requests fail |
| Shutdown                | stdio and HTTP processes stop without leaving an active request or listener                                                     |

## Evidence record

Store a sanitized JSON or Markdown record under `evals/baselines/` only after the run. Include:

- UTC date, clean server commit, package/image digest, Node version, deployment region, and transport;
- client name/version and explicit model identifier when the client exposes it;
- pass/fail for every journey, safe structured error codes, elapsed-time range, and citation review;
- confirmation that no credentials, private queries, document text, or file bytes were retained; and
- reviewer name plus any accepted deviation and expiry/retest trigger.

Do not describe the hosted profile as accepted until all three clients pass on the same candidate revision. Rerun after tool/resource/schema changes, MCP SDK/client upgrades, authentication changes, or material transport changes. The complete multilingual model-quality gate remains the separate 22-case process in `docs/evals.md`.
