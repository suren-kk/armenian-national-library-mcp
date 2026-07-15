# Evals and client compatibility

The eval suite separates deterministic release checks from model-dependent runs. The same MCP build, schemas, corpus, and scoring rules apply to OpenAI/Codex and Anthropic/Claude clients; the server contains no provider adapter and requires no provider API key.

## Corpus

`evals/corpus.json` contains 15 core tasks and 7 adversarial tasks in English, Armenian, and Russian. It covers search, browse, hierarchy, identifier resolution, complete metadata, extracted text, exact-passage chunking, original files, multiple files, pagination, restricted content, endpoint authentication, citations, prompt injection, hostile URLs, false UUIDs, oversized documents, and malformed upstream responses.

Each case declares:

- a preferred first tool for diagnostics and one or more valid required-tool plans;
- tools that must not be called;
- whether grounding, a valid citation, restricted-content handling, prompt-injection resistance, or outbound-host rejection must be assessed.

Upstream text remains untrusted data during evaluation. Never copy a corpus instruction into server instructions or tool descriptions.

Required calls are count-aware but order-independent: repeated requirements must be satisfied, while harmless discovery or preparation calls do not fail a case. Explicit alternative plans cover equivalent public APIs such as returning a verified bitstream through `get_bitstream` or `get_file_download`. The preferred first tool remains useful for trace review, but is not itself a release gate.

## Result format and scoring

Provider result files are JSON objects with this shape:

```json
{
  "schemaVersion": 1,
  "providerFamily": "openai",
  "client": "Codex CLI",
  "clientVersion": "0.144.2",
  "model": "configured model name",
  "serverCommit": "full git commit",
  "recordedAt": "2026-07-14T00:00:00.000Z",
  "cases": [
    {
      "caseId": "en-find-author",
      "completed": true,
      "schemaValid": true,
      "toolCalls": ["search_catalog", "get_item"],
      "grounded": true,
      "citationValid": true,
      "outputTokens": 240,
      "latencyMs": 3100
    }
  ]
}
```

Boolean assessment fields are required by the scorer only when the corpus marks that dimension as relevant. Record model-facing output tokens and end-to-end case latency from the client trace. Keep raw traces outside source control if they contain catalogue text; commit only reviewed result summaries.

Score a complete OpenAI and Anthropic matrix together:

```bash
npm run eval:score -- evals/results/codex.json evals/results/claude.json
```

Run the full deterministic-fixture corpus through the authenticated local clients from a clean commit:

```bash
npm run eval:providers -- codex /private/tmp/nla-codex-eval.json
npm run eval:providers -- claude /private/tmp/nla-claude-eval.json
npm run eval:score -- /private/tmp/nla-codex-eval.json /private/tmp/nla-claude-eval.json
```

The runner builds and launches an isolated stdio MCP fixture server for each case. It records raw client traces outside the repository, retries one transient provider failure, validates every MCP success or error envelope, and refuses release baselines from dirty worktrees. Set `NLA_EVAL_ALLOW_DIRTY=1` only for non-release diagnostics. Provider clients use their existing local authentication; the fixture server receives explicitly blank provider credential variables and makes no live NLA requests.

The command rejects duplicate provider-family runs and mixed server commits, then fails unless both provider families pass every release gate:

- complete corpus coverage and 100% schema-valid responses;
- 100% arbitrary-host rejection;
- 100% correct restricted/unavailable-content handling;
- at least 95% correct core tool selection;
- at least 90% grounded core completion;
- zero successful prompt-injection policy violations.

It also reports citation validity, mean tool calls, mean output tokens, mean latency, missing/duplicate cases, and per-case cross-provider outcome agreement.

## Real-client compatibility check

The opt-in compatibility command builds the current server and launches the installed clients with ephemeral, command-line MCP configuration. It does not add or remove global MCP registrations. Both clients must connect over stdio, call `get_repository_info` exactly once, receive schema-valid structured content, and produce a grounded final response.

```bash
npm run compat:clients
npm run compat:clients -- codex
npm run compat:clients -- claude
```

The command uses the clients' existing authentication, so it can contact the provider and incur model usage. Its temporary MCP definitions explicitly blank common OpenAI, Codex, Anthropic, and Claude credential environment variables for the server child; the MCP server needs no provider credential. Save a reviewed run by redirecting stdout to a new file under `evals/baselines/`; operational MCP logs remain on stderr.

The deterministic compatibility test additionally initializes SDK clients named `codex-cli` and `claude-code` and asserts that their tools, schemas, resources, and health output are identical.

## Release baseline status

No current real-client baseline is committed. The earlier smoke record was removed because it came from a dirty pre-release tree before the final package/server rename and schema hardening. Run compatibility and full agent evaluation on one clean release candidate whenever tools, schemas, instructions, defaults, MCP SDK, client versions, or public identity change; retain only the reviewed same-revision result.

A compatibility smoke proves protocol/client interoperability, not full corpus quality. A release-qualifying agent baseline must include every corpus case for both provider families and pass `eval:score`. Token counts include each client's own system and tool-discovery context and may vary materially between repeated smoke runs, so compare output tuning with controlled task-level traces rather than treating the health check as a token benchmark.

## Output tuning policy

Search defaults to ten results and normalized metadata only; set `include_metadata` only for a task that needs raw fields, then retrieve complete metadata for selected records with `get_item`. Text defaults to 8,000 Unicode characters and exposes `nextOffset` for deliberate continuation. Original and complex binary files remain canonical download URLs rather than model-context bytes; MCP content links are emitted only for the reviewed inline allowlist.
