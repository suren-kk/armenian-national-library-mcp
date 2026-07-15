#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { loadConfig } from "../config.js";
import { NlaClient } from "../nla/client.js";
import { NlaError } from "../nla/errors.js";
import { NlaRepository } from "../nla/repository.js";

interface SearchEntry {
  normalized?: { uuid?: unknown };
}

function itemUuids(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  const results = (value as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== "object") return [];
    const uuid = (entry as SearchEntry).normalized?.uuid;
    return typeof uuid === "string" ? [uuid] : [];
  });
}

async function main(): Promise<void> {
  if (process.env.NLA_LIVE_COVERAGE !== "true") {
    throw new Error(
      "Set NLA_LIVE_COVERAGE=true to acknowledge that this command samples the live NLA catalogue",
    );
  }
  const sampleSize = Number(process.env.NLA_COVERAGE_SAMPLE_SIZE ?? "25");
  if (!Number.isSafeInteger(sampleSize) || sampleSize < 1 || sampleSize > 200) {
    throw new Error(
      "NLA_COVERAGE_SAMPLE_SIZE must be an integer from 1 to 200",
    );
  }
  const scopeUuid = process.env.NLA_COVERAGE_SCOPE_UUID?.trim() || undefined;
  const config = loadConfig();
  const repository = new NlaRepository(new NlaClient(config.nla));
  const uuids: string[] = [];
  let page = 0;
  while (uuids.length < sampleSize) {
    const search = await repository.search({
      query: "*",
      dso_type: "item",
      ...(scopeUuid ? { scope_uuid: scopeUuid } : {}),
      page,
      page_size: Math.min(50, sampleSize - uuids.length),
      filters: [],
      include_metadata: false,
    });
    uuids.push(...itemUuids(search.data));
    if (!search.pagination?.hasNext || itemUuids(search.data).length === 0)
      break;
    page += 1;
  }

  let publicOriginal = 0;
  let usableText = 0;
  let neither = 0;
  const errors: Record<string, number> = {};
  for (const uuid of uuids.slice(0, sampleSize)) {
    try {
      const result = await repository.listItemFiles(uuid);
      const files = result.data.bundles.flatMap((bundle) => bundle.files);
      const hasOriginal = files.some(
        (file) => file.bundle === "ORIGINAL" && file.access.publiclyReadable,
      );
      const hasText = files.some(
        (file) =>
          file.bundle === "TEXT" &&
          file.mimeType === "text/plain" &&
          file.access.publiclyReadable,
      );
      if (hasOriginal) publicOriginal += 1;
      if (hasText) usableText += 1;
      if (!hasOriginal && !hasText) neither += 1;
    } catch (error) {
      const code = error instanceof NlaError ? error.code : "UNEXPECTED";
      errors[code] = (errors[code] ?? 0) + 1;
    }
  }
  const sampled = Math.min(uuids.length, sampleSize);
  const ratio = (count: number) =>
    sampled === 0 ? null : Number((count / sampled).toFixed(4));
  const serverCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        recordedAt: new Date().toISOString(),
        serverCommit,
        scopeUuid: scopeUuid ?? null,
        requestedSampleSize: sampleSize,
        sampled,
        publicOriginal: { count: publicOriginal, ratio: ratio(publicOriginal) },
        usableText: { count: usableText, ratio: ratio(usableText) },
        neither: { count: neither, ratio: ratio(neither) },
        errors,
        limitation:
          "This convenience sample is not representative unless collection/language strata were selected and documented before collection.",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Content coverage measurement failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
