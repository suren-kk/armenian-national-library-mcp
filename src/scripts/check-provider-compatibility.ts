import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CompatibilityResult } from "../evals/types.js";
import { healthOutput } from "../schemas/outputs.js";

const PROMPT =
  "Use the nla MCP server get_repository_info tool exactly once. " +
  "Do not use shell commands or inspect files. Return only compact JSON with " +
  "repository, status, and profile from the tool result.";
const EXPECTED = {
  repository: "National Library of Armenia",
  status: "ok",
  profile: "public-read",
} as const;
const EMPTY_PROVIDER_ENV = {
  ANTHROPIC_API_KEY: "",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  CODEX_API_KEY: "",
  OPENAI_API_KEY: "",
} as const;

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  latencyMs: number;
  timedOut: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs = 120_000,
): Promise<ProcessResult> {
  return new Promise((resolvePromise, reject) => {
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolvePromise({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
        latencyMs: Math.round(performance.now() - startedAt),
        timedOut,
      });
    });
  });
}

function jsonLines(output: string): Record<string, unknown>[] {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim().startsWith("{")) return [];
    try {
      const value = JSON.parse(line) as unknown;
      return isRecord(value) ? [value] : [];
    } catch {
      return [];
    }
  });
}

function matchesExpected(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Object.entries(EXPECTED).every(([key, expected]) => {
    return record[key] === expected;
  });
}

function parseJsonText(value: unknown): unknown {
  if (typeof value !== "string") return null;
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    return null;
  }
}

function version(command: string): string {
  return execFileSync(command, ["--version"], { encoding: "utf8" }).trim();
}

async function checkCodex(serverPath: string): Promise<CompatibilityResult> {
  const result = await runProcess("codex", [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--json",
    "--color",
    "never",
    "-s",
    "read-only",
    "-C",
    process.cwd(),
    "-c",
    'mcp_servers.nla.command="node"',
    "-c",
    `mcp_servers.nla.args=[${JSON.stringify(serverPath)}]`,
    "-c",
    'mcp_servers.nla.env={ANTHROPIC_API_KEY="",CLAUDE_CODE_OAUTH_TOKEN="",CODEX_API_KEY="",OPENAI_API_KEY=""}',
    PROMPT,
  ]);
  if (result.timedOut || result.exitCode !== 0) {
    throw new Error(
      result.timedOut
        ? "Codex compatibility check timed out"
        : `Codex compatibility check failed: ${result.stderr}`,
    );
  }
  const events = jsonLines(result.stdout);
  const toolEvents = events.filter((event) => {
    const item = event.item as Record<string, unknown> | undefined;
    return (
      event.type === "item.completed" &&
      item?.type === "mcp_tool_call" &&
      item.server === "nla"
    );
  });
  const toolCalls = toolEvents.flatMap((event) => {
    const item = event.item as Record<string, unknown>;
    return typeof item.tool === "string" ? [item.tool] : [];
  });
  const toolResult = toolEvents[0]?.item as
    { result?: { structured_content?: unknown } } | undefined;
  const finalMessage = events.findLast((event) => {
    const item = event.item as Record<string, unknown> | undefined;
    return event.type === "item.completed" && item?.type === "agent_message";
  });
  const finalText = (finalMessage?.item as { text?: unknown } | undefined)
    ?.text;
  const usageEvent = events.findLast(
    (event) => event.type === "turn.completed",
  );
  const usage = usageEvent?.usage as Record<string, unknown> | undefined;

  return {
    providerFamily: "openai",
    client: "Codex CLI",
    clientVersion: version("codex"),
    model: "configured-default",
    connected: toolCalls.length > 0,
    expectedTool: "get_repository_info",
    observedToolCalls: toolCalls,
    schemaValid: healthOutput.safeParse(toolResult?.result?.structured_content)
      .success,
    groundedResponse: matchesExpected(parseJsonText(finalText)),
    latencyMs: result.latencyMs,
    usage: {
      inputTokens:
        typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
      cachedInputTokens:
        typeof usage?.cached_input_tokens === "number"
          ? usage.cached_input_tokens
          : null,
      outputTokens:
        typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
      costUsd: null,
    },
  };
}

async function checkClaude(serverPath: string): Promise<CompatibilityResult> {
  const mcpConfig = JSON.stringify({
    mcpServers: {
      nla: {
        command: "node",
        args: [serverPath],
        env: EMPTY_PROVIDER_ENV,
      },
    },
  });
  const result = await runProcess("claude", [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfig,
    "--allowedTools",
    "mcp__nla__get_repository_info",
    "--permission-mode",
    "dontAsk",
    PROMPT,
  ]);
  if (result.timedOut || result.exitCode !== 0) {
    throw new Error(
      result.timedOut
        ? "Claude compatibility check timed out"
        : `Claude compatibility check failed: ${result.stderr}`,
    );
  }
  const events = jsonLines(result.stdout);
  const init = events.find(
    (event) => event.type === "system" && event.subtype === "init",
  );
  const contentBlocks = events.flatMap((event) => {
    const message = event.message as { content?: unknown } | undefined;
    return Array.isArray(message?.content)
      ? (message.content as Record<string, unknown>[])
      : [];
  });
  const toolCalls = contentBlocks.flatMap((block) => {
    if (block.type !== "tool_use" || typeof block.name !== "string") return [];
    return block.name.startsWith("mcp__nla__")
      ? [block.name.slice("mcp__nla__".length)]
      : [];
  });
  const final = events.findLast((event) => event.type === "result");
  const usage = final?.usage as Record<string, unknown> | undefined;
  const modelUsage = final?.modelUsage as Record<string, unknown> | undefined;
  const cachedInputTokens = modelUsage
    ? Object.values(modelUsage).reduce<number>((total, value) => {
        if (value === null || typeof value !== "object") return total;
        const count = (value as Record<string, unknown>).cacheReadInputTokens;
        return total + (typeof count === "number" ? count : 0);
      }, 0)
    : null;
  const toolResult = events.find((event) => {
    const value = event.tool_use_result;
    return isRecord(value) && "structuredContent" in value;
  });
  const structuredContent = (
    toolResult?.tool_use_result as { structuredContent?: unknown } | undefined
  )?.structuredContent;

  return {
    providerFamily: "anthropic",
    client: "Claude Code",
    clientVersion: version("claude"),
    model: typeof init?.model === "string" ? init.model : "configured-default",
    connected: toolCalls.length > 0,
    expectedTool: "get_repository_info",
    observedToolCalls: toolCalls,
    schemaValid: healthOutput.safeParse(structuredContent).success,
    groundedResponse: matchesExpected(parseJsonText(final?.result)),
    latencyMs: result.latencyMs,
    usage: {
      inputTokens:
        typeof usage?.input_tokens === "number" ? usage.input_tokens : null,
      cachedInputTokens,
      outputTokens:
        typeof usage?.output_tokens === "number" ? usage.output_tokens : null,
      costUsd:
        typeof final?.total_cost_usd === "number" ? final.total_cost_usd : null,
    },
  };
}

const requestedProvider = process.argv[2] ?? "all";
if (!["all", "codex", "claude"].includes(requestedProvider)) {
  throw new Error("Provider must be one of: all, codex, claude");
}
const serverPath = resolve(process.cwd(), "dist/index.js");
if (!existsSync(serverPath)) {
  throw new Error("dist/index.js is missing; run npm run build first");
}
const checks: Array<Promise<CompatibilityResult>> = [];
if (requestedProvider !== "claude") checks.push(checkCodex(serverPath));
if (requestedProvider !== "codex") checks.push(checkClaude(serverPath));
const results = await Promise.all(checks);
const report = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  serverCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTreeDirty:
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
      .length > 0,
  transport: "stdio",
  results,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (
  results.some(
    (entry) =>
      !entry.connected ||
      !entry.schemaValid ||
      !entry.groundedResponse ||
      entry.observedToolCalls.length !== 1 ||
      entry.observedToolCalls[0] !== entry.expectedTool,
  )
) {
  process.exitCode = 1;
}
