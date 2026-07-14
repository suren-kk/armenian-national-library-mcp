import { NlaError } from "./errors.js";
import type { DspacePage, HalDocument, Pagination } from "./types.js";

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parsePage(value: unknown): DspacePage | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object")
    throw NlaError.invalidResponse("Malformed DSpace page metadata");
  const page = value as Partial<DspacePage>;
  if (
    !isFiniteNonNegative(page.number) ||
    !isFiniteNonNegative(page.size) ||
    !isFiniteNonNegative(page.totalElements) ||
    !isFiniteNonNegative(page.totalPages)
  ) {
    throw NlaError.invalidResponse("Malformed DSpace page values");
  }
  return page as DspacePage;
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
