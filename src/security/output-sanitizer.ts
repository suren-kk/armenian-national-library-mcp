/* eslint-disable no-control-regex -- these are exactly the terminal controls removed from upstream data */
const DANGEROUS_CONTROLS = new RegExp(
  "[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f]",
  "g",
);
/* eslint-enable no-control-regex */

export function sanitizeUpstreamText(value: string): string {
  return value.replace(DANGEROUS_CONTROLS, "");
}

export function sanitizeUnknown<T>(value: T): T {
  if (typeof value === "string") return sanitizeUpstreamText(value) as T;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => sanitizeUnknown(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        sanitizeUnknown(entry),
      ]),
    ) as T;
  }
  return value;
}
