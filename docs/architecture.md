# Architecture and dependency rules

The runtime follows an inward dependency direction. Transports adapt stdio or HTTP into the MCP server; the server composes tools and resources; tools and resources call the NLA repository; the repository coordinates the HTTP client and content resolver. Boundary schemas validate data before it crosses into MCP output.

```text
transports -> server -> tools/resources -> repository/content -> client
                                      \-> schemas
client/repository -> security policies -> NLA public API
all layers -> observability
```

The following rules are enforced by `tests/architecture/dependencies.test.ts`:

- `nla` domain and gateway modules never import MCP tools, resources, server composition, or transports.
- security policies never import tools, resources, server composition, transports, or MCP schemas.
- schemas never import tools, resources, server composition, or transports. They may reuse runtime domain schemas so runtime and static contracts cannot drift.
- resources never import tools, server composition, or transports.
- tools never import resources or transports.
- the server composition root never imports a transport.
- observability remains independent of all application layers.

The small `security`/`nla` cycle is intentional: gateway modules consume URL/content policies, while those policies use the shared typed `NlaError`. New cross-layer exceptions should be documented here and covered by a focused contract test.

The server is read-only and provider-neutral. Provider credentials, mutation clients, arbitrary URL fetching, and filesystem writes do not belong in any runtime layer.
