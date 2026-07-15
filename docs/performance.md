# Core-flow performance budgets

Performance depends on NLA latency and item shape, so budgets separate application-controlled upstream-call counts from observed end-to-end latency. Run `npm run benchmark:live` from a stable network before a release and retain only the generated aggregate JSON, never queries or document content.

## Initial regression budgets

| Flow                          |                    Cold upstream-call budget | Warm upstream-call budget | P95 investigation threshold |
| ----------------------------- | -------------------------------------------: | ------------------------: | --------------------------: |
| Search first page             |                                            1 |                         0 |                         5 s |
| Resolve/get known handle      |                    2 including safe redirect |                         0 |                         4 s |
| List one bundle with one file |                       4 plus item resolution |    0 while cache is fresh |                        10 s |
| First text chunk              | enumeration/detail calls plus 1 content read |    0 while cache is fresh |                        12 s |
| First chunk plus continuation | enumeration/detail calls plus 1 content read |    0 while cache is fresh |                        12 s |
| Missing-item error            |                                            1 |                         1 |                         4 s |

File-list cold calls scale as two enumeration requests plus format and access requests for each returned bitstream. Pagination is caller-controlled, identical in-flight reads coalesce, and the global concurrency bound limits pressure. A threshold breach is an investigation signal rather than proof of a product regression: compare NLA status, network conditions, item file count, cold/warm state, and response sizes.

## Release method

1. Use the same clean server commit and Node version as the release candidate.
2. Set `NLA_LIVE_BENCHMARKS=true`; optionally set `NLA_BENCHMARK_ITERATIONS` from 1 to 20 (use at least 5 for a meaningful percentile baseline).
3. Run from the intended deployment region at least twice at different times.
4. Compare P50, P95, call counts, errors, and item/file shape with the previous release.
5. Investigate a sustained threshold or call-budget regression before optimizing.

The deterministic suite separately locks important mechanics such as cache hits, single-flight requests, cancellation, cache eviction, and the one-file cold-call budget. Live measurements are not placed in ordinary CI because upstream availability and public catalogue changes are outside this project's control.

## Version 1.0.0 local baseline

The initial five-iteration aggregate baseline is stored in [`evals/baselines/performance-1.0.0-local-2026-07-15.json`](../evals/baselines/performance-1.0.0-local-2026-07-15.json). It was captured from clean commit `ed0a011a55cab6bf2c5902a591d13d6d90de6925` using Node.js 24.15.0 on macOS 26.5.2 arm64.

All latency investigation thresholds passed. Cold P95 ranged from 14 ms for the structured missing-item path to 255 ms for search; warm cacheable journeys completed in 0–2 ms with no upstream calls. File enumeration used 15 calls because the current known item exposes four bundles and multiple bitstreams; this is consistent with the documented per-bitstream format/access scaling and is recorded as the 1.0.0 item-shape baseline rather than a fixed global allowance.
