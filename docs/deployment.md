# Streamable HTTP deployment

The remote profile uses stateless MCP Streamable HTTP at `/mcp`. It does not implement the deprecated standalone SSE transport, server-side sessions, resumability, or authentication. Liveness is available at `/healthz`; readiness at `/readyz` verifies the NLA API root and caches the result for five seconds.

## Local configuration

Build the server, select HTTP transport, and keep the default loopback binding:

```bash
npm run build
MCP_TRANSPORT=http npm start
```

The defaults accept Host values `127.0.0.1` and `localhost`, browser origins `http://127.0.0.1:3000` and `http://localhost:3000`, and native MCP clients that omit `Origin`.

## Production configuration

Use TLS in production. The Node process serves plain HTTP, so terminate TLS at a trusted reverse proxy and forward only to the private listener. Configure the public authorities explicitly:

```text
MCP_TRANSPORT=http
MCP_HOST=127.0.0.1
MCP_PORT=3000
MCP_ALLOWED_HOSTS=mcp.example.org
MCP_ALLOWED_ORIGINS=https://inspector.example.org
MCP_MAX_REQUEST_BYTES=1048576
MCP_RATE_LIMIT_WINDOW_MS=60000
MCP_RATE_LIMIT_PER_CLIENT=60
MCP_RATE_LIMIT_GLOBAL=600
MCP_TRUST_PROXY=true
```

`MCP_ALLOWED_HOSTS` contains comma-separated host authorities. Ports are ignored during comparison. `MCP_ALLOWED_ORIGINS` contains comma-separated, exact HTTP(S) origins without paths, queries, fragments, or credentials. A supplied `Origin` is mandatory to validate; requests without one are accepted for non-browser MCP clients.

Keep `MCP_TRUST_PROXY=false` unless the server is directly behind a trusted reverse proxy that removes caller-supplied forwarding headers and writes its own `X-Forwarded-For`. With proxy trust disabled, per-client rate limits use the direct TCP peer. Global limits always apply.

The application rejects compressed request bodies. JSON request bodies are bounded before parsing, and the default maximum is 1 MiB. Health probes are outside the MCP rate limit so orchestrators can reliably assess the process.

## Probe examples

```bash
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/readyz
```

Readiness returns `503` when the configured NLA API is unavailable. Do not expose the Node listener directly to the public internet; use the proxy for TLS, connection limits, access logs, and any future authentication layer.
