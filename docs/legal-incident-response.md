# Legal, Privacy, and Rights Incident Runbook

Owner: Suren Karapetyan

Contact: `surenakar@gmail.com`

Last reviewed: 2026-07-14

This runbook covers project-controlled security/privacy events, unlawful or disputed content paths, personal-data complaints, regulator or law-enforcement requests, and compromised release artifacts. It supplements [SECURITY.md](../SECURITY.md), [PRIVACY.md](../PRIVACY.md), and [TAKEDOWN.md](../TAKEDOWN.md). Self-hosting operators need a deployment-specific runbook and qualified legal advice for their jurisdictions.

## Immediate triage

1. Record the UTC time, reporter, affected version/commit, item or bitstream identifiers, deployment, and minimum necessary evidence.
2. Classify the event as security, privacy/personal data, copyright/rights, source-record accuracy, service abuse, release compromise, or legal demand.
3. Do not copy sensitive material into public issues, ordinary logs, chat, or test fixtures. Move the discussion to a restricted channel.
4. Preserve relevant source revision, package/image digest, sanitized logs, request IDs, and correspondence. Do not preserve unrelated user content.
5. Determine who controls the affected system: project maintainer, NLA, self-hosting operator, MCP/AI provider, GitHub/npm, or another vendor.

## Containment

- For project code or documentation, prepare a minimal patch, remove or qualify the affected mapping/link, and stop the release workflow if publication is pending.
- For a compromised package or image, revoke affected credentials, disable the workflow/environment, warn users through the canonical repository, and publish a new version rather than replacing an immutable version.
- For NLA-hosted source material, contact the NLA through official channels and publish only a project-side mitigation within the maintainer's control.
- For a self-hosted deployment, notify the operator that it must stop the instance, clear runtime caches, rotate affected secrets, or upgrade as appropriate.
- Never weaken Host/Origin, TLS, authentication, access, or URL restrictions as a workaround.

## Assessment and notification

Document the material involved, people and territories affected, confidentiality/integrity/availability impact, likelihood of harm, continuing exposure, and mitigation. Consult qualified counsel promptly when personal data, a credible rightsholder claim, a government request, or mandatory notification may be involved. Applicable deadlines depend on the operator, establishment, affected people, and law; do not delay assessment while waiting for complete certainty.

Notify only the parties who need the information, which may include the reporter, affected users/operators, NLA, a provider, package registry, repository host, insurer, counsel, or regulator. Share the minimum necessary facts and use a secure channel for sensitive evidence.

## Recovery and closure

1. Verify the patch or operational action with focused tests and the normal release gates.
2. Publish a security advisory, correction, rights-policy update, or incident notice when appropriate and lawful.
3. Record decisions, notices, versions, and remaining risk; separate facts from legal conclusions.
4. Retain the incident record under [PRIVACY.md](../PRIVACY.md), restrict access, and delete unnecessary evidence.
5. Add a regression test or policy control and review whether the threat model, data flow, dependencies, contacts, or legal checklist must change.

Government or law-enforcement requests must be verified and reviewed by qualified counsel before voluntary disclosure unless an emergency legal obligation clearly requires otherwise. The project maintainer does not promise access to data that the software does not collect or retain.
