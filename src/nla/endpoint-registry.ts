import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { requireHalDocument } from "./hal.js";
import { NlaError } from "./errors.js";
import type { NlaClient } from "./client.js";
import type { HalDocument, HalLink } from "./types.js";

export const endpointRecordSchema = z
  .object({
    relation: z.string().min(1),
    path: z.string().startsWith("/"),
    methods: z
      .array(z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]))
      .min(1),
    access: z.enum(["public", "authenticated", "mixed"]),
    risk: z.enum(["read", "write", "mixed", "operational"]),
    semanticTool: z.string().min(1).nullable(),
    liveTest: z.union([
      z.boolean(),
      z.literal("authentication-required"),
      z.literal("skip-templated"),
    ]),
    rawAllowed: z.boolean(),
    templated: z.boolean(),
  })
  .strict();

export type EndpointRecord = z.infer<typeof endpointRecordSchema>;

export function concreteEndpointPath(path: string): string {
  const templateStart = path.indexOf("{");
  return templateStart >= 0 ? path.slice(0, templateStart) : path;
}

const endpointMatrixSchema = z
  .array(endpointRecordSchema)
  .min(1)
  .superRefine((records, context) => {
    const relations = new Set<string>();
    for (const [index, record] of records.entries()) {
      if (relations.has(record.relation)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate endpoint relation: ${record.relation}`,
          path: [index, "relation"],
        });
      }
      relations.add(record.relation);
      if (
        record.rawAllowed &&
        !record.methods.includes("GET") &&
        !record.methods.includes("HEAD")
      ) {
        context.addIssue({
          code: "custom",
          message: "rawAllowed requires GET or HEAD",
          path: [index, "rawAllowed"],
        });
      }
      if (record.rawAllowed && record.access === "authenticated") {
        context.addIssue({
          code: "custom",
          message:
            "authenticated-only endpoints cannot be raw-readable in the public profile",
          path: [index, "rawAllowed"],
        });
      }
      if (
        record.semanticTool === null &&
        !record.rawAllowed &&
        record.risk === "read" &&
        record.access === "public"
      ) {
        context.addIssue({
          code: "custom",
          message:
            "public read endpoints require a semantic tool or controlled raw access",
          path: [index],
        });
      }
    }
  });

const defaultMatrixUrl = new URL(
  "../../config/endpoint-matrix.yaml",
  import.meta.url,
);

export function loadEndpointRegistry(
  matrixUrl: URL = defaultMatrixUrl,
): EndpointRecord[] {
  let value: unknown;
  try {
    value = parse(readFileSync(fileURLToPath(matrixUrl), "utf8")) as unknown;
  } catch (error) {
    throw NlaError.invalidResponse("Unable to read the endpoint matrix", {
      path: fileURLToPath(matrixUrl),
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  const result = endpointMatrixSchema.safeParse(value);
  if (!result.success) {
    throw NlaError.invalidResponse("Endpoint matrix validation failed", {
      issues: result.error.issues,
    });
  }
  return result.data;
}

export function endpointFamily(path: string): string {
  if (path === "/") return "root";
  if (path.startsWith("/server/actuator")) return "actuator";
  return path.split("/").filter(Boolean)[0] ?? "root";
}

export function summarizeEndpointRegistry(records: readonly EndpointRecord[]) {
  const countBy = (field: "access" | "risk") =>
    Object.fromEntries(
      [...new Set(records.map((record) => record[field]))]
        .sort()
        .map((value) => [
          value,
          records.filter((record) => record[field] === value).length,
        ]),
    );
  const families = Object.fromEntries(
    [...new Set(records.map((record) => endpointFamily(record.path)))]
      .sort()
      .map((family) => [
        family,
        records.filter((record) => endpointFamily(record.path) === family)
          .length,
      ]),
  );
  return {
    totalRelations: records.length,
    rawReadableRelations: records.filter((record) => record.rawAllowed).length,
    semanticRelations: records.filter((record) => record.semanticTool !== null)
      .length,
    byAccess: countBy("access"),
    byRisk: countBy("risk"),
    byFamily: families,
    semanticTools: [
      ...new Set(
        records.flatMap((record) =>
          record.semanticTool ? [record.semanticTool] : [],
        ),
      ),
    ].sort(),
  };
}

interface AdvertisedRelation {
  relation: string;
  href: string;
  templated: boolean;
  normalizedPath: string;
}

export interface EndpointDriftReport {
  checkedAt: string;
  registryRelations: number;
  advertisedRelations: number;
  newRelations: AdvertisedRelation[];
  removedRelations: EndpointRecord[];
  changedUrls: Array<{
    relation: string;
    expectedPath: string;
    actualPath: string;
    href: string;
  }>;
  changedAnonymousAccess: Array<{
    relation: string;
    expected: "public" | "authenticated";
    actual: "public" | "authentication-required";
  }>;
  accessChecksSkipped: string[];
  hasDrift: boolean;
}

function asSingleLink(value: unknown): HalLink | null {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Partial<HalLink>).href === "string"
  ) {
    return value as HalLink;
  }
  return null;
}

export function normalizeAdvertisedPath(
  href: string,
  apiBaseUrl: string,
): string {
  const templateStart = href.indexOf("{");
  const plainHref = templateStart >= 0 ? href.slice(0, templateStart) : href;
  const template = templateStart >= 0 ? href.slice(templateStart) : "";
  let url: URL;
  try {
    url = new URL(plainHref);
  } catch {
    return href;
  }
  const base = new URL(apiBaseUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  if (url.origin !== base.origin)
    return `${url.origin}${url.pathname}${template}`;
  if (url.pathname === basePath) return template ? `/${template}` : "/";
  if (url.pathname.startsWith(`${basePath}/`)) {
    return `${url.pathname.slice(basePath.length)}${template}`;
  }
  return `${url.pathname}${template}`;
}

export function advertisedRelations(
  root: HalDocument,
  apiBaseUrl: string,
): AdvertisedRelation[] {
  return Object.entries(root._links ?? {})
    .map(([relation, value]) => {
      const link = asSingleLink(value);
      if (!link) {
        throw NlaError.invalidResponse(
          `API root relation ${relation} has a malformed link`,
        );
      }
      return {
        relation,
        href: link.href,
        templated: link.templated === true,
        normalizedPath: normalizeAdvertisedPath(link.href, apiBaseUrl),
      };
    })
    .sort((left, right) => left.relation.localeCompare(right.relation));
}

function requestPath(record: EndpointRecord): string | null {
  if (record.templated || record.path.startsWith("/server/")) return null;
  return record.path === "/" ? "" : record.path;
}

async function probeAnonymousAccess(
  client: NlaClient,
  record: EndpointRecord,
  signal?: AbortSignal,
): Promise<"public" | "authentication-required" | "skip"> {
  const path = requestPath(record);
  if (path === null) return "skip";
  try {
    await client.getBytes(path, {
      query: { page: 0, size: 1 },
      signal,
      maxResponseBytes: Math.min(client.config.maxMetadataBytes, 65_536),
      headers: { Accept: "application/hal+json, application/json" },
    });
    return "public";
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    if (
      error instanceof NlaError &&
      (error.code === "NLA_AUTHENTICATION_REQUIRED" ||
        error.code === "NLA_ACCESS_RESTRICTED")
    ) {
      return "authentication-required";
    }
    return "skip";
  }
}

export async function checkEndpointRegistryDrift(
  client: NlaClient,
  records: readonly EndpointRecord[],
  options: {
    checkAccess?: boolean;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<EndpointDriftReport> {
  const response = await client.getJson<HalDocument>("", {
    signal: options.signal,
  });
  const advertised = advertisedRelations(
    requireHalDocument(response.data),
    client.config.apiBaseUrl,
  );
  const registryByRelation = new Map(
    records.map((record) => [record.relation, record]),
  );
  const advertisedByRelation = new Map(
    advertised.map((record) => [record.relation, record]),
  );
  const newRelations = advertised.filter(
    (record) => !registryByRelation.has(record.relation),
  );
  const removedRelations = records.filter(
    (record) => !advertisedByRelation.has(record.relation),
  );
  const changedUrls = advertised.flatMap((actual) => {
    const expected = registryByRelation.get(actual.relation);
    return expected && expected.path !== actual.normalizedPath
      ? [
          {
            relation: actual.relation,
            expectedPath: expected.path,
            actualPath: actual.normalizedPath,
            href: actual.href,
          },
        ]
      : [];
  });
  const changedAnonymousAccess: EndpointDriftReport["changedAnonymousAccess"] =
    [];
  const accessChecksSkipped: string[] = [];
  if (options.checkAccess) {
    const candidates = records.flatMap((record) => {
      const expected: "public" | "authenticated" | null =
        record.liveTest === true
          ? "public"
          : record.liveTest === "authentication-required"
            ? "authenticated"
            : null;
      return expected ? [{ record, expected }] : [];
    });
    const probes = await Promise.all(
      candidates.map(async ({ record, expected }) => ({
        record,
        expected,
        actual: await probeAnonymousAccess(client, record, options.signal),
      })),
    );
    for (const { record, expected, actual } of probes) {
      if (actual === "skip") {
        accessChecksSkipped.push(record.relation);
      } else if (
        (expected === "public" && actual === "authentication-required") ||
        (expected === "authenticated" && actual === "public")
      ) {
        changedAnonymousAccess.push({
          relation: record.relation,
          expected,
          actual,
        });
      }
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    registryRelations: records.length,
    advertisedRelations: advertised.length,
    newRelations,
    removedRelations,
    changedUrls,
    changedAnonymousAccess,
    accessChecksSkipped,
    hasDrift:
      newRelations.length > 0 ||
      removedRelations.length > 0 ||
      changedUrls.length > 0 ||
      changedAnonymousAccess.length > 0,
  };
}
