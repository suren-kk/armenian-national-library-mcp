import { randomUUID } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ResourceLink,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { NlaError } from "../nla/errors.js";
import { Logger } from "../observability/logger.js";
import { noopMetrics, type Metrics } from "../observability/metrics.js";
import {
  toolEnvelopeOutputs,
  type EnvelopeToolName,
} from "../schemas/outputs.js";

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toolLogger = new Logger("mcp-tools");

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function trustedResourceLink(value: unknown): ResourceLink | null {
  const candidate = record(value);
  if (
    candidate?.type !== "resource_link" ||
    typeof candidate.uri !== "string" ||
    typeof candidate.name !== "string" ||
    (candidate.description !== undefined &&
      typeof candidate.description !== "string") ||
    (candidate.mimeType !== undefined &&
      typeof candidate.mimeType !== "string") ||
    (candidate.size !== undefined &&
      (typeof candidate.size !== "number" ||
        !Number.isSafeInteger(candidate.size) ||
        candidate.size < 0))
  ) {
    return null;
  }
  let uri: URL;
  try {
    uri = new URL(candidate.uri);
  } catch {
    return null;
  }
  const path = /^\/([^/]+)\/content$/.exec(uri.pathname);
  if (
    uri.protocol !== "nla:" ||
    uri.hostname !== "bitstream" ||
    uri.username !== "" ||
    uri.password !== "" ||
    uri.port !== "" ||
    uri.search !== "" ||
    uri.hash !== "" ||
    !path?.[1] ||
    !UUID_PATTERN.test(path[1])
  ) {
    return null;
  }
  return candidate as unknown as ResourceLink;
}

export function singleResourceLink(value: unknown): ResourceLink[] {
  const link = trustedResourceLink(record(record(value)?.data)?.resourceLink);
  return link ? [link] : [];
}

export function fileResourceLinks(value: unknown): ResourceLink[] {
  const data = record(record(value)?.data);
  if (!Array.isArray(data?.bundles)) return [];
  const links: ResourceLink[] = [];
  for (const bundleValue of data.bundles) {
    const bundle = record(bundleValue);
    if (!Array.isArray(bundle?.files)) continue;
    for (const fileValue of bundle.files) {
      const link = trustedResourceLink(record(fileValue)?.resourceLink);
      if (link) links.push(link);
    }
  }
  return links;
}

export function successResult(
  value: unknown,
  resourceLinks: readonly ResourceLink[] = [],
): CallToolResult {
  const structuredContent = value as Record<string, unknown>;
  return {
    structuredContent,
    content: [{ type: "text", text: JSON.stringify(value) }, ...resourceLinks],
  };
}

function resultCount(value: unknown): number | null {
  const envelope = record(value);
  const data = record(envelope?.data);
  if (Array.isArray(envelope?.data)) return envelope.data.length;
  if (Array.isArray(data?.results)) return data.results.length;
  if (Array.isArray(data?.bundles)) {
    let count = 0;
    for (const bundleValue of data.bundles as unknown[]) {
      const bundle = record(bundleValue);
      if (Array.isArray(bundle?.files)) count += bundle.files.length;
    }
    return count;
  }
  return null;
}

function durationSince(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function observedSuccessResult(
  tool: string,
  value: unknown,
  startedAt: number,
  metrics: Metrics = noopMetrics,
  resourceLinks: readonly ResourceLink[] = [],
): CallToolResult {
  const durationMs = durationSince(startedAt);
  const envelope = record(value);
  toolLogger.info("tool_call_completed", {
    tool,
    durationMs,
    resultCount: resultCount(value),
    truncated:
      typeof envelope?.truncated === "boolean" ? envelope.truncated : null,
  });
  metrics.increment("nla_tool_calls_total", 1, { tool, outcome: "success" });
  metrics.observe("nla_tool_duration_ms", durationMs, {
    tool,
    outcome: "success",
  });
  return successResult(value, resourceLinks);
}

function failureResult(
  tool: string,
  error: unknown,
  startedAt: number,
  metrics: Metrics,
): CallToolResult {
  const durationMs = durationSince(startedAt);
  let value: Record<string, unknown>;
  if (error instanceof NlaError) {
    value = error.toJSON();
    toolLogger.warn("tool_call_failed", {
      tool,
      durationMs,
      errorCode: error.code,
    });
  } else {
    const correlationId = randomUUID();
    toolLogger.error("unexpected_tool_error", {
      tool,
      durationMs,
      correlationId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    value = {
      code: "NLA_INTERNAL_ERROR",
      message: "The server encountered an unexpected internal error.",
      guidance:
        "Retry later and provide the correlation ID if the issue persists.",
      correlationId,
    };
  }
  const errorCode =
    typeof value.code === "string" ? value.code : "NLA_INTERNAL_ERROR";
  metrics.increment("nla_tool_calls_total", 1, {
    tool,
    outcome: "error",
    errorCode,
  });
  metrics.observe("nla_tool_duration_ms", durationMs, {
    tool,
    outcome: "error",
  });
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

export function registerEnvelopeTool<
  S extends z.ZodObject<z.ZodRawShape>,
  N extends EnvelopeToolName,
>(
  server: McpServer,
  name: N,
  description: string,
  schema: S,
  handler: (args: z.output<S>, signal: AbortSignal) => Promise<unknown>,
  metrics: Metrics = noopMetrics,
  resourceLinks: (value: unknown) => ResourceLink[] = () => [],
): void {
  const outputSchema = toolEnvelopeOutputs[name];
  server.registerTool(
    name,
    {
      description,
      inputSchema: schema.shape,
      outputSchema: outputSchema.shape,
      annotations: READ_ONLY,
    },
    async (args, extra) => {
      const startedAt = performance.now();
      try {
        const value = outputSchema.parse(
          await handler(args as z.output<S>, extra.signal),
        );
        return observedSuccessResult(
          name,
          value,
          startedAt,
          metrics,
          resourceLinks(value),
        );
      } catch (error) {
        return failureResult(name, error, startedAt, metrics);
      }
    },
  );
}
