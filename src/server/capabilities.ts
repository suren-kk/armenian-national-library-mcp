import type { AppConfig } from "../config.js";

export function capabilitySummary(config: AppConfig) {
  return {
    status: "ok" as const,
    repository: "National Library of Armenia" as const,
    projectStatus: "independent-unofficial-research" as const,
    maintainer: "Suren Karapetyan" as const,
    affiliation:
      "Not affiliated with, endorsed by, sponsored by, or operated by the National Library of Armenia" as const,
    contentRights:
      "Technical access is not permission for reuse; source rights may be unknown" as const,
    profile: "public-read" as const,
    transport: config.mcp.transport,
    apiBaseUrl: config.nla.apiBaseUrl,
    capabilities: [
      "catalogue-search",
      "facets",
      "browse",
      "community-hierarchy",
      "collection-scoped-search",
      "item-metadata",
      "identifier-resolution",
      "item-access-status",
      "item-bundle-listing",
      "nla-extracted-text-chunking",
      "bitstream-resources",
      "original-file-download-links",
      "endpoint-coverage-catalogue",
      "controlled-raw-api-reads",
      "stateless-streamable-http",
    ],
  };
}
