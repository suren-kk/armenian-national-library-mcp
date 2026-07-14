import { NlaError } from "./errors.js";
import type { DspacePage, HalDocument, Pagination } from "./types.js";

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parsePage(value: unknown): DspacePage | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object")
    throw NlaError.invalidResponse("Malformed DSpace page metadata");
  const page = value as Partial<DspacePage>;
  if (
    !isSafeNonNegativeInteger(page.number) ||
    !isSafeNonNegativeInteger(page.size) ||
    !isSafeNonNegativeInteger(page.totalElements) ||
    !isSafeNonNegativeInteger(page.totalPages)
  ) {
    throw NlaError.invalidResponse("Malformed DSpace page values");
  }
  if (
    (page.totalPages === 0 && page.totalElements !== 0) ||
    (page.totalPages > 0 && page.number >= page.totalPages)
  ) {
    throw NlaError.invalidResponse("Contradictory DSpace page values");
  }
  return {
    number: page.number,
    size: page.size,
    totalElements: page.totalElements,
    totalPages: page.totalPages,
  };
}

export function paginationFrom(document: HalDocument): Pagination | null {
  const page = parsePage(document.page);
  if (!page) return null;
  return {
    page: page.number,
    pageSize: page.size,
    totalElements: page.totalElements,
    totalPages: page.totalPages,
    hasNext: page.number + 1 < page.totalPages,
  };
}
