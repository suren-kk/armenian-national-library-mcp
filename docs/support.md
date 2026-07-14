# Support and upstream outage runbook

## Support boundary

This project supports the public, read-only NLA DSpace API through the documented MCP tools and stdio or Streamable HTTP transports. NLA account access, repository mutations, local OCR, client/provider billing, reverse-proxy administration, and the availability or correctness of NLA-owned records are outside the server's support boundary.

When requesting support, provide the MCP version, transport, client name/version, UTC timestamp, tool name, sanitized error code/message, and a minimal identifier or query that reproduces the problem. Include request IDs and redacted stderr logs when available. Never attach credentials, cookies, authorization headers, full document text, or file bytes.

Use the repository issue tracker for reproducible non-sensitive defects and feature requests. Use private vulnerability reporting for security issues as described in [SECURITY.md](../SECURITY.md).

## Identify an upstream outage

For an HTTP deployment, liveness and readiness distinguish the server process from NLA availability:

```bash
curl --fail https://mcp.example.org/healthz
curl --fail https://mcp.example.org/readyz
```

- `/healthz` `200` and `/readyz` `503`: the MCP process is alive but its NLA API readiness check failed.
- Both endpoints unavailable: investigate the MCP process, container, proxy, DNS, and network path first.
- Both endpoints `200` but a tool fails: inspect the structured MCP error and reproduce with the live integration test.

From a trusted operator shell, confirm the configured API root without adding credentials:

```bash
curl --fail --silent --show-error \
  -H 'Accept: application/hal+json' \
  https://api.nla.am/server/api

NLA_LIVE_TESTS=true npm test -- tests/integration/live.test.ts
NLA_DRIFT_CHECK_ACCESS=true npm run drift:check
```

Do not work around an outage by changing `NLA_ALLOWED_HOST`, following an alternate host, disabling TLS validation, or widening the API base path. Those settings enforce the SSRF and redirect boundary.

## Respond to an outage or drift

1. Record the first observed UTC time, affected tools, status codes, request IDs, MCP version, and source revision.
2. Check whether failures are total, limited to Discover/search, limited to bitstream content, or caused by a changed root relation.
3. Retry only after the server's bounded retry/backoff has finished. Avoid tight manual loops against the public NLA service.
4. Keep `/healthz` serving for orchestration diagnostics; allow `/readyz` to remain `503` so traffic is not routed to a dependency-unready instance.
5. If drift is reported, review new, removed, or moved relations against `config/endpoint-matrix.yaml`. Never automatically classify a new endpoint as public/read-safe.
6. Escalate persistent upstream failures to the NLA service owner with sanitized times, paths, and status codes. Do not send MCP client secrets or unrelated user data.
7. After recovery, rerun the live and drift suites, close the incident with its duration and impact, and add a regression test if server behavior contributed.

The nightly workflow runs both checks independently and writes their outcomes to the workflow summary. A failed scheduled run should be triaged as dependency drift/outage first; it does not by itself prove a server regression.
