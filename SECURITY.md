# Security policy

## Supported versions

Security fixes are made for the latest `1.x` release. Operators should run the newest published minor or patch version and rebuild pinned container deployments after every security release.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository host's private vulnerability-reporting feature (on GitHub: **Security → Advisories → Report a vulnerability**). If private reporting is unavailable, email Suren Karapetyan at `surenakar@gmail.com` with the subject `nla-research-mcp security report`. Include:

- Affected package or image version and source revision.
- Reproduction steps and the expected security boundary.
- Impact, prerequisites, and whether the issue is already public.
- Sanitized logs or requests with credentials, catalogue text, and document content removed.

The maintainer will acknowledge a report, establish severity and scope, coordinate a fix and disclosure date, and publish a patched release and advisory when appropriate. Do not email credentials, private keys, full document text, or unnecessary personal data; ask for a secure transfer method if sensitive evidence is essential.

Operational incidents and upstream NLA availability problems are not security vulnerabilities. Follow [the support and outage runbook](docs/support.md) for those cases.

Privacy incidents and rights complaints follow [PRIVACY.md](PRIVACY.md) and [TAKEDOWN.md](TAKEDOWN.md).
