function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Verify selections against file-list access fields, never item metadata. */
export function verifiedDownloadSelection(
  toolCalls: readonly string[],
  toolArguments: readonly unknown[],
  structuredOutputs: readonly unknown[],
  finalText: string,
): boolean {
  const files = new Map<string, string>();
  for (const [index, tool] of toolCalls.entries()) {
    if (tool !== "list_item_files") continue;
    const output = structuredOutputs[index];
    if (!record(output) || !record(output.data)) continue;
    const bundles = output.data.bundles;
    if (!Array.isArray(bundles)) continue;
    for (const bundle of bundles) {
      if (!record(bundle) || !Array.isArray(bundle.files)) continue;
      for (const file of bundle.files) {
        if (
          record(file) &&
          typeof file.uuid === "string" &&
          typeof file.downloadUrl === "string" &&
          record(file.access) &&
          file.access.publiclyReadable === true
        ) {
          files.set(file.uuid, file.downloadUrl);
        }
      }
    }
  }
  for (const [index, tool] of toolCalls.entries()) {
    if (tool !== "get_file_download" && tool !== "get_bitstream") continue;
    const args = toolArguments[index];
    if (
      !record(args) ||
      typeof args.uuid !== "string" ||
      !files.has(args.uuid)
    ) {
      return false;
    }
  }
  let citedDownload = false;
  for (const match of finalText.matchAll(
    /(?:https?:\/\/|nla:\/\/)[^\s<>"`]+/g,
  )) {
    const link = match[0].replace(/[)\].,;!*_։،؟]+$/, "");
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      return false;
    }
    const uuid =
      url.pathname.match(/\/core\/bitstreams\/([^/]+)/)?.[1] ??
      (url.protocol === "nla:" && url.hostname === "bitstream"
        ? url.pathname.split("/")[1]
        : undefined);
    if (!uuid) continue;
    const canonical = files.get(uuid);
    if (!canonical) return false;
    if (url.protocol !== "nla:") {
      if (link !== canonical) return false;
      citedDownload = true;
    }
  }
  return citedDownload;
}
