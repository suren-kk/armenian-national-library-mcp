# Endpoint coverage

`config/endpoint-matrix.yaml` is the source of truth for every relation advertised by the National Library of Armenia DSpace API root. The server validates the file at startup and rejects an empty catalogue, malformed records, duplicate relations, or a raw-readable relation without `GET` or `HEAD` support.

Each record documents:

- `relation`: HAL relation name from the API root.
- `path`: normalized path relative to the configured API base; actuator paths remain absolute to the host path because they sit outside `/server/api`.
- `methods`: upstream methods represented by the endpoint.
- `access`: `public`, `authenticated`, or `mixed`.
- `risk`: `read`, `write`, `mixed`, or `operational`.
- `semanticTool`: preferred MCP tool, or `null` when no semantic tool exists.
- `liveTest`: `true`, `authentication-required`, `skip-templated`, or `false` to describe the anonymous probe expectation.
- `rawAllowed`: whether `nla_api_get` may read the endpoint.
- `templated`: whether the API root advertises a URI template.

The `get_api_capabilities` tool returns coverage totals and concrete raw-readable base paths, with URI-template query expressions removed so the values can be used directly. Set `include_endpoints` to return all original records. The same complete result is available as the static `nla://api/endpoints` MCP resource.

## Controlled raw reads

`nla_api_get` is an escape hatch for approved read operations without a semantic tool. It is not an HTTP proxy. It permits only `GET` and `HEAD`, API-relative allowlisted paths, bounded pagination and response sizes, and JSON or plain-text bodies. It does not accept headers or credentials. Absolute and protocol-relative URLs, encoded traversal or separators, query strings embedded in the path, protected/write-only prefixes, and `/core/bitstreams/{uuid}/content` are rejected.

## Drift detection

Run the source-tree checker with:

```bash
npm run drift:check
```

After a build, `npm run drift:check:built` performs the same check from `dist`. The checker compares relation names and normalized URLs from the live API root with the matrix. Exit code `0` means no drift, `1` means drift was found, and `2` means the check failed.

Set `NLA_DRIFT_CHECK_ACCESS=true` to also issue bounded anonymous `GET` probes for non-templated records with a declared live expectation. Probes request a single result and accept at most 64 KiB. Unsupported or inconclusive probes are reported in `accessChecksSkipped`; public-to-protected and protected-to-public changes are reported as drift.
