import { NlaError } from "./errors.js";
import type { HalDocument, HalLink, HalLinkValue } from "./types.js";
import type { UrlPolicy } from "../security/url-policy.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isHalDocument(value: unknown): value is HalDocument {
  return (
    isRecord(value) &&
    (isRecord(value._links) ||
      isRecord(value._embedded) ||
      value.type === "root")
  );
}

export function requireHalDocument(value: unknown): HalDocument {
  if (!isHalDocument(value)) {
    throw NlaError.invalidResponse("Expected a DSpace HAL document");
  }
  return value;
}

function validateLink(
  value: unknown,
  policy: UrlPolicy,
): asserts value is HalLink {
  if (!isRecord(value) || typeof value.href !== "string") {
    throw NlaError.invalidResponse("Malformed HAL link");
  }
  if (!value.templated)
    policy.assertAllowed(new URL(value.href, policy.baseUrl));
}

export function validatedLinks(
  document: HalDocument,
  policy: UrlPolicy,
): Record<string, HalLinkValue> {
  const links = document._links ?? {};
  for (const value of Object.values(links)) {
    if (Array.isArray(value)) {
      for (const link of value) validateLink(link, policy);
    } else {
      validateLink(value, policy);
    }
  }
  return links;
}

export function getEmbedded<T>(document: HalDocument, relation: string): T[] {
  const value = document._embedded?.[relation];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw NlaError.invalidResponse(`HAL relation ${relation} is not an array`);
  }
  return value as T[];
}

export function getEmbeddedObject<T>(
  document: HalDocument,
  relation: string,
): T | null {
  const value = document._embedded?.[relation];
  if (value === undefined || value === null) return null;
  if (!isRecord(value))
    throw NlaError.invalidResponse(`HAL relation ${relation} is not an object`);
  return value as T;
}

export function getLink(
  document: HalDocument,
  relation: string,
): HalLink | null {
  const value = document._links?.[relation];
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
