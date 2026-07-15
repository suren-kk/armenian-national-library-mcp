# Measuring text and original-file coverage

The server can read text only when NLA provides a public `text/plain` bitstream in a `TEXT` bundle. It does not run local PDF extraction or OCR. When text is unavailable, the supported fallback is normalized metadata, rights/access evidence, and a canonical public original-file URL when one exists.

Run an opt-in sample with:

```bash
NLA_LIVE_COVERAGE=true \
NLA_COVERAGE_SAMPLE_SIZE=25 \
npm run measure:content-coverage
```

Set `NLA_COVERAGE_SCOPE_UUID` to a collection/community UUID to measure a documented scope. The command reports only aggregate counts and safe error codes; it does not write queries, titles, identifiers, metadata, or document text to the result.

## Representative measurement protocol

A global first-page sample is a convenience check, not a defensible coverage estimate. Before publishing a product claim:

1. Select collection strata that represent the intended research audiences.
2. Include Armenian, Russian, and other relevant language/document-type strata.
3. Fix the sample sizes and selection method before reading results.
4. Record the clean server commit, UTC date, scope UUIDs, sample sizes, errors, and NLA availability.
5. Report public-original and usable-text proportions separately with the fallback rate.
6. Repeat periodically because repository content and access metadata change.

The product owner must approve the strata and acceptable coverage before the README makes a quantitative claim or local extraction/OCR enters the roadmap. Until then, the accurate promise is conditional: text is available for records with a usable public NLA `TEXT` bitstream.
