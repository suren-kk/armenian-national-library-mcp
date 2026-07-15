# Privacy Notice

Effective date: 2026-07-14

Contact: Suren Karapetyan, `surenakar@gmail.com`

## Scope and operating model

`armenian-national-library-mcp` is distributed as independent, unofficial research software for local or self-hosted use. Suren Karapetyan does not operate a public hosted MCP endpoint as part of this project. This notice describes the software's default behavior and information received directly by the project maintainer. A person or organization that hosts the HTTP profile is responsible for its own privacy notice, legal basis, retention, security, processors, user-rights process, and cross-border transfers.

## Default software data flow

1. An MCP client sends a tool or resource request to the locally running or self-hosted server.
2. The server sends the necessary read-only request to `https://api.nla.am`.
3. NLA receives ordinary network information, including the connecting IP address, request path, query parameters, timing, and user-agent/network metadata determined by its service.
4. The server returns NLA metadata, text, or file information to the MCP client.
5. The MCP client may transmit that result to the AI provider or other service configured by the user.

The software contains no OpenAI or Anthropic runtime SDK and does not independently select or contact an AI provider. Provider processing is controlled by the user's MCP client and provider account. Users should review those providers' privacy, retention, training, and transfer settings before processing sensitive research material.

## Information processed by the software

Depending on the request and deployment, the runtime processes:

- catalogue queries, identifiers, filters, and pagination inputs;
- NLA metadata, extracted text, filenames, access status, and canonical links;
- request identifiers, tool timing, upstream status, byte/result counts, retry counts, and error categories;
- direct peer or trusted-proxy identifiers used for HTTP rate limiting; and
- Host, Origin, content length, and other HTTP protocol data required for security.

Default application logs do not include search queries, full document text, file bytes, authorization headers, cookies, tokens, or user-provided secrets. Redaction is a safeguard, not a guarantee that an operator's reverse proxy, container platform, MCP client, shell redirection, or added instrumentation follows the same policy.

## Storage and retention

- The default response cache is process memory only, is limited by configuration, and uses a 30-second time-to-live. It disappears when the process exits.
- Default HTTP rate-limit identifiers live in process memory for the configured window, normally 60 seconds, and are not written by the application.
- Structured logs are written to stderr. The project does not transmit or retain them; local and self-hosted operators decide whether and how long their environment stores them.
- The project has no analytics, advertising identifiers, cookies, user accounts, or telemetry service.
- Emails sent to the maintainer for support, privacy, security, or rights requests may be retained while the request is handled and for up to 24 months afterward to document the response, unless a longer period is reasonably necessary for a dispute, security incident, or legal obligation.
- Public GitHub issues, pull requests, and repository activity are processed under GitHub's terms and privacy notice and may remain in repository history.

## Personal data in source material

NLA records and documents can contain information about identifiable people. Public availability does not eliminate privacy, accuracy, or other legal concerns. Users should minimize the material they send to model providers, avoid unnecessary sensitive-person searches, and contact the authoritative repository when source records require correction or removal.

## Requests and complaints

To ask about information directly controlled by the project maintainer, request correction or deletion, or raise a privacy concern, email `surenakar@gmail.com` with the subject `armenian-national-library-mcp privacy request`. The maintainer may request enough information to verify the request and locate the relevant correspondence or project record.

For data held in an NLA record, an AI-provider account, GitHub, a hosting platform, or a self-hosted deployment, contact that controller or operator directly. This project cannot delete information from systems it does not control.

This notice describes the current default project and is not legal advice. Material changes will receive a new effective date.
