# Streamable HTTP deployment

The remote profile uses stateless MCP Streamable HTTP at `/mcp`. It does not implement the deprecated standalone SSE transport, server-side sessions, or resumability. It defaults to a local-only Host policy, supports an optional bearer-token gate, and can sit behind an authenticating trusted proxy. Liveness is available at `/healthz`; readiness at `/readyz` verifies the NLA API root and caches the result for five seconds.

The project maintainer does not operate a public hosted endpoint. Anyone exposing this profile to other people becomes responsible for that deployment's terms, privacy notice, lawful basis, retention, processors, security, user-rights handling, and rights/takedown response. Start with the data flow and operator requirements in [PRIVACY.md](../PRIVACY.md) and [DATA_AND_CONTENT_RIGHTS.md](../DATA_AND_CONTENT_RIGHTS.md).

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
MCP_AUTH_MODE=trusted-proxy
MCP_MAX_REQUEST_BYTES=1048576
MCP_BODY_TIMEOUT_MS=10000
MCP_MAX_IN_FLIGHT=32
MCP_MAX_IN_FLIGHT_PER_CLIENT=4
MCP_RATE_LIMIT_WINDOW_MS=60000
MCP_RATE_LIMIT_PER_CLIENT=60
MCP_RATE_LIMIT_GLOBAL=600
MCP_RATE_LIMIT_MAX_IDENTITIES=2048
MCP_TRUST_PROXY=true
```

`MCP_AUTH_MODE=local` is the default and rejects non-loopback allowed Host names. For a private listener behind an authenticating gateway, use `trusted-proxy` and ensure the listener is unreachable except from that gateway. Alternatively, set `MCP_AUTH_MODE=bearer` and provide a randomly generated `MCP_BEARER_TOKEN` of at least 32 characters; callers must send it as an `Authorization: Bearer` credential. Bearer mode is a simple deployment control, not an OAuth issuer/audience/scope implementation. Keep the token out of source, logs, shell history, and client-visible output, rotate it after suspected exposure, and still terminate TLS before the Node listener.

`MCP_ALLOWED_HOSTS` contains comma-separated host authorities. Ports are ignored during comparison. `MCP_ALLOWED_ORIGINS` contains comma-separated, exact HTTP(S) origins without paths, queries, fragments, or credentials. A supplied `Origin` is mandatory to validate; requests without one are accepted for non-browser MCP clients.

Keep `MCP_TRUST_PROXY=false` unless the server is directly behind a trusted reverse proxy that removes caller-supplied forwarding headers and writes its own `X-Forwarded-For`. `MCP_TRUST_PROXY` affects client identity only; it does not enable authentication and is independent from `MCP_AUTH_MODE`. With proxy trust disabled, per-client rate limits use the direct TCP peer. Global limits always apply.

The application accepts only an unambiguous `application/json` POST representation, rejects compressed bodies, applies a ten-second body-read deadline, and bounds JSON before parsing at 1 MiB by default. It limits active MCP work globally and per client, bounds rate-limiter identity state, and applies a separate coarse limiter to every HTTP route. The in-process controls are per instance and are not a replacement for proxy connection limits, distributed quotas, or authentication.

Set `NLA_METRICS_MODE=log` when your runtime collects structured stderr JSON. This optional exporter emits content-free counters, gauges, and observations for tool calls/errors/duration, upstream outcomes, latency, response bytes, retries, cache hits/evictions, active requests, and queue depth. Ordinary structured tool-completion events include only tool name, duration, result count, and truncation; safe failure events add the stable error category. Metric labels contain only bounded tool/status/method/error categories; queries, identifiers, headers, and content are never labels. Leave metrics mode at `none` when the extra event volume is not useful.

## Probe examples

```bash
curl --fail http://127.0.0.1:3000/healthz
curl --fail http://127.0.0.1:3000/readyz
```

Readiness returns `503` when the configured NLA API is unavailable. Do not expose the Node listener directly to the public internet. Keep it on loopback or a private network unless a trusted proxy enforces TLS, client authentication with issuer/audience/scope validation, distributed quotas, connection and slow-client limits, and sanitized access logs. Proxy credentials terminate at that boundary and must never be forwarded to NLA.

## Container runtime

`Dockerfile` uses a digest-pinned distroless Node runtime and runs as its unprivileged numeric nonroot user. `compose.yaml` supplies controls that cannot be encoded in an image: a read-only root filesystem, all Linux capabilities dropped, no-new-privileges, PID/memory/CPU limits, a constrained temporary filesystem, and loopback-only port publishing.

```bash
docker compose up --build
```

For a proxy deployment, override `MCP_ALLOWED_HOSTS`, `MCP_ALLOWED_ORIGINS`, and `MCP_TRUST_PROXY` deliberately. Keep the application port private; publish the proxy rather than changing `MCP_BIND_ADDRESS` unless the surrounding network provides equivalent isolation. Direct `docker run` users must reproduce the Compose security options.
