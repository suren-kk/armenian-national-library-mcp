#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { loadConfig } from "../config.js";
import { NlaClient } from "../nla/client.js";
import { NlaError } from "../nla/errors.js";
import { NlaRepository } from "../nla/repository.js";

const KNOWN_HANDLE = "123456789/10740";

interface Sample {
  durationMs: number;
  upstreamCalls: number;
}

interface Flow {
  name: string;
  run(repository: NlaRepository): Promise<unknown>;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

function summarize(samples: readonly Sample[]) {
  return {
    samples: samples.length,
    latencyMs: {
      p50: percentile(
        samples.map(({ durationMs }) => durationMs),
        0.5,
      ),
      p95: percentile(
        samples.map(({ durationMs }) => durationMs),
        0.95,
      ),
    },
    upstreamCalls: {
      minimum: Math.min(...samples.map(({ upstreamCalls }) => upstreamCalls)),
      maximum: Math.max(...samples.map(({ upstreamCalls }) => upstreamCalls)),
    },
  };
}

async function main(): Promise<void> {
  if (process.env.NLA_LIVE_BENCHMARKS !== "true") {
    throw new Error(
      "Set NLA_LIVE_BENCHMARKS=true to acknowledge that this command contacts the live NLA API",
    );
  }
  const iterations = Number(process.env.NLA_BENCHMARK_ITERATIONS ?? "5");
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 20) {
    throw new Error("NLA_BENCHMARK_ITERATIONS must be an integer from 1 to 20");
  }
  const config = loadConfig();
  const flows: Flow[] = [
    {
      name: "search_first_page",
      run: (repository) =>
        repository.search({
          query: "Armenia",
          dso_type: "item",
          page: 0,
          page_size: 5,
          filters: [],
          include_metadata: false,
        }),
    },
    {
      name: "get_known_item",
      run: (repository) => repository.getItem(KNOWN_HANDLE),
    },
    {
      name: "list_known_item_files",
      run: (repository) => repository.listItemFiles(KNOWN_HANDLE),
    },
    {
      name: "first_text_chunk",
      run: (repository) =>
        repository.getItemText(KNOWN_HANDLE, {
          offsetChars: 0,
          maxChars: 8_000,
        }),
    },
    {
      name: "text_continuation_journey",
      run: async (repository) => {
        const first = await repository.getItemText(KNOWN_HANDLE, {
          offsetChars: 0,
          maxChars: 8_000,
        });
        if (first.data.nextOffset === null) {
          throw new Error(
            "Known text fixture unexpectedly has no continuation",
          );
        }
        return repository.getItemText(KNOWN_HANDLE, {
          offsetChars: first.data.nextOffset,
          maxChars: 8_000,
        });
      },
    },
    {
      name: "missing_item_error",
      run: async (repository) => {
        try {
          await repository.getItem("00000000-0000-4000-8000-000000000000");
        } catch (error) {
          if (error instanceof NlaError && error.code === "NLA_NOT_FOUND") {
            return error.code;
          }
          throw error;
        }
        throw new Error("Known-missing item unexpectedly resolved");
      },
    },
  ];
  const results: Record<string, { cold: Sample[]; warm: Sample[] }> =
    Object.fromEntries(flows.map(({ name }) => [name, { cold: [], warm: [] }]));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (const flow of flows) {
      let upstreamCalls = 0;
      const countingFetch: typeof fetch = (input, init) => {
        upstreamCalls += 1;
        return globalThis.fetch(input, init);
      };
      const repository = new NlaRepository(
        new NlaClient(config.nla, countingFetch),
      );
      const coldStartedAt = performance.now();
      const callsBeforeCold = upstreamCalls;
      await flow.run(repository);
      results[flow.name]!.cold.push({
        durationMs: Math.round(performance.now() - coldStartedAt),
        upstreamCalls: upstreamCalls - callsBeforeCold,
      });

      const warmStartedAt = performance.now();
      const callsBeforeWarm = upstreamCalls;
      await flow.run(repository);
      results[flow.name]!.warm.push({
        durationMs: Math.round(performance.now() - warmStartedAt),
        upstreamCalls: upstreamCalls - callsBeforeWarm,
      });
    }
  }

  const summarized = Object.fromEntries(
    Object.entries(results).map(([name, samples]) => [
      name,
      { cold: summarize(samples.cold), warm: summarize(samples.warm) },
    ]),
  );
  const serverCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        serverCommit,
        iterations,
        knownHandle: KNOWN_HANDLE,
        results: summarized,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Live benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
