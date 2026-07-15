# Product success and feedback

This project has no telemetry service. Product learning is opt-in and privacy-preserving: users may report aggregate outcomes manually through GitHub issues without submitting queries, document text, credentials, or file bytes.

## Measures

Release and roadmap reviews should track:

| Measure                       | Definition                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Install completion            | A clean user environment initializes MCP and lists all tools/resources.                                                                   |
| Time to first grounded record | Time from starting setup to a result containing an NLA canonical URL and source provenance.                                               |
| Core task completion          | Completion rate for search, refinement, metadata, text, and original-file journeys, separated by English, Armenian, and Russian.          |
| Citation validity             | Completed research answers whose cited canonical NLA URL resolves to the described record.                                                |
| No-text fallback rate         | Item-text requests without a usable public NLA `TEXT` bundle that still return useful metadata/original-file guidance.                    |
| Rights clarity                | Results with unknown reuse rights that visibly preserve the warning rather than implying permission.                                      |
| Structured error distribution | Aggregate counts by safe error code such as `NLA_NOT_FOUND`, `NLA_ACCESS_RESTRICTED`, `NLA_RATE_LIMITED`, and `NLA_UPSTREAM_UNAVAILABLE`. |
| Performance                   | P50/P95 latency and upstream-call counts for the core flows defined in `performance.md`.                                                  |

## Manual feedback format

Reports should include the package/source version, client and version, language, attempted journey, whether a grounded NLA record was found, whether text was available, elapsed-time range, safe structured error code, and whether the documentation resolved the problem. Use a public identifier only when necessary to reproduce the issue.

Do not report search text about a person, full extracted passages, private research notes, model-provider credentials, authorization headers, cookies, tokens, or downloaded file bytes. Security concerns belong in the private channel described by `SECURITY.md`.

Maintainers should review these aggregate measures before adding broad new API surface. A feature should solve a repeated user failure or a measured coverage gap, not merely mirror another upstream endpoint.
