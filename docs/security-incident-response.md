# Security incident response

Owner: Suren Karapetyan

Contact: `surenakar@gmail.com`

This private-maintainer runbook applies to suspected source compromise, leaked credentials, malicious releases, vulnerable dependencies, container compromise, boundary bypasses, and material abuse of a hosted deployment. It complements the public reporting policy in `SECURITY.md` and the privacy/legal runbook.

## Triage targets

| Severity | Example                                                                                             | Initial target                                         |
| -------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Critical | Active credential/release compromise, host execution, unauthorized write or sensitive-data exposure | Begin immediately; contain before ordinary development |
| High     | Exploitable trust-boundary bypass, authentication failure, practical denial of service              | Acknowledge within 24 hours and prioritize a fix       |
| Medium   | Material defense-in-depth weakness with credible prerequisites                                      | Acknowledge within 3 business days                     |
| Low      | Hardening or assurance gap with limited impact                                                      | Schedule in normal maintenance                         |

Targets are operational goals, not guarantees or admissions. Preserve reporter confidentiality and collect only the minimum evidence required.

## Containment

1. Record the time, affected revisions/versions/digests, reporter channel, and a sanitized reproduction.
2. Stop affected release workflows and disable compromised environments, tokens, trusted-publisher relationships, deploy keys, or GitHub Apps.
3. Revoke and rotate affected npm, GitHub, registry, signing, proxy, and hosting credentials. Do not put replacement secrets in issues or logs.
4. If an npm package or container is malicious, deprecate the affected version where possible, remove mutable tags, publish a security notice, and preserve immutable hashes for investigation.
5. If a hosted endpoint is involved, isolate it, preserve minimal relevant logs, invalidate caches, and apply gateway blocks without forwarding MCP credentials to NLA.
6. Notify NLA through an official channel when the event materially affects its service, data, or request traffic; do not imply that this project represents NLA.

## Eradication and recovery

- Identify the earliest affected commit and every derived npm, image, SBOM, source, and checksum artifact.
- Fix from a reviewed clean branch, update vulnerable dependencies/base images, and run deterministic CI, CodeQL, Trivy, advisory, protocol, security, and package-boundary checks.
- Publish a new immutable version. Never overwrite an npm version or move an existing signed release tag.
- Restore credentials only after removing the original access path and reviewing account/audit logs.
- Verify downstream installation instructions and announce exact safe versions and digests.

## Notification and review

Coordinate disclosure with the reporter when safe. Notify affected users promptly when action is required, stating impact, affected versions, indicators, containment, safe versions, and credential/data steps without exposing exploit details prematurely. Assess privacy, legal, and contractual notification requirements with qualified counsel when personal data or regulated operators are involved.

After recovery, document the timeline, root cause, affected artifacts, decisions, control failures, and follow-up owners. Add regression tests and update the threat model. Retain incident records with restricted access only as long as necessary for security, legal, and accountability needs.
