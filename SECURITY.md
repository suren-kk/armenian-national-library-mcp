# Security policy

## Supported versions

Security fixes are made for the latest `1.x` release. Operators should run the newest published minor or patch version and rebuild pinned container deployments after every security release.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue. Use the repository host's private vulnerability-reporting feature (on GitHub: **Security → Advisories → Report a vulnerability**) and include:

- Affected package or image version and source revision.
- Reproduction steps and the expected security boundary.
- Impact, prerequisites, and whether the issue is already public.
- Sanitized logs or requests with credentials, catalogue text, and document content removed.

The maintainers will acknowledge a report, establish severity and scope, coordinate a fix and disclosure date, and publish a patched release and advisory. If private reporting is unavailable on the repository host, contact the maintainer identified by the distribution channel before sharing details.

Operational incidents and upstream NLA availability problems are not security vulnerabilities. Follow [the support and outage runbook](docs/support.md) for those cases.
