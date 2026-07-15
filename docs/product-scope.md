# Product scope and deliberate deferrals

The supported initial product is an independent, public-read research connector. Its stable user surface is the tool and resource list documented in the README and asserted by protocol tests.

## Included

- Catalogue search, facet discovery, browse indexes, communities, collections, and collection-scoped search.
- Complete item metadata, normalized research fields, rights evidence, access status, relationships, versions, and identifiers.
- Lossless paginated bundle/bitstream discovery, bounded NLA-provided text, validated bitstream metadata, and canonical public download links.
- Identifier resolution, endpoint coverage inspection, and controlled allowlisted raw reads.
- stdio for local clients and an authenticated/private-boundary Streamable HTTP profile.

## Deliberately deferred

- Separate metadata-schema, metadata-field, and bitstream-format registry tools. These are advanced DSpace administration/discovery concerns; `get_api_capabilities` and controlled raw reads cover approved research needs without expanding every agent's tool menu.
- Item, community, and collection metadata resources. Semantic tools are the supported representation because they provide bounded pagination, normalized fields, rights warnings, and consistent provenance. Resources remain focused on content/bitstream retrieval and the static endpoint catalogue.
- Local PDF extraction or OCR. `get_item_text` uses only NLA-provided `TEXT` bundles; otherwise the fallback is metadata plus a canonical public original-file URL when access permits.
- Authenticated NLA records, mutations, submission workflows, local file writes, stateful HTTP sessions, resumability, and server-side tasks.

Adding a deferred capability requires a demonstrated user journey, a contract and security review, bounded resource behavior, protocol tests, and updated privacy/rights documentation. Absence from this release is intentional rather than an implied unfinished promise.
