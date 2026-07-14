import {
  getEmbedded,
  getEmbeddedObject,
  requireHalDocument,
  validatedLinks,
} from "./hal.js";
import { normalizeDspaceObject } from "./metadata-normalizer.js";
import { paginationFrom } from "./pagination.js";
import type {
  DspaceObject,
  Envelope,
  HalDocument,
  NormalizedDspaceObject,
  Pagination,
} from "./types.js";
import { NlaError } from "./errors.js";
import type { NlaClient } from "./client.js";
import {
  NlaContentResolver,
  type BundleWithFiles,
} from "./content-resolver.js";

export interface SearchFilter {
  field: string;
  value: string;
  operator: "equals" | "contains" | "notequals" | "authority";
}

export interface SearchOptions {
  query: string;
  dso_type: "item" | "collection" | "community" | "all";
  scope_uuid?: string | undefined;
  page: number;
  page_size: number;
  sort?: string | undefined;
  filters: SearchFilter[];
  include_metadata: boolean;
}

export interface PageOptions {
  page: number;
  page_size: number;
}

interface SearchObject {
  hitHighlights?: Record<string, string[]>;
  _embedded?: { indexableObject?: DspaceObject };
}

function asDspaceObject(value: unknown): DspaceObject {
  if (
    value === null ||
    typeof value !== "object" ||
    (typeof (value as Partial<DspaceObject>).id !== "string" &&
      typeof (value as Partial<DspaceObject>).uuid !== "string") ||
    typeof (value as Partial<DspaceObject>).type !== "string"
  ) {
    throw NlaError.invalidResponse("Malformed DSpace object");
  }
  return value as DspaceObject;
}

function boundedPageSize(requested: number, maximum: number): number {
  return Math.min(requested, maximum);
}

export class NlaRepository {
  readonly content: NlaContentResolver;

  constructor(
    private readonly client: NlaClient,
    content?: NlaContentResolver,
  ) {
    this.content = content ?? new NlaContentResolver(client);
  }

  async search(
    options: SearchOptions,
    signal?: AbortSignal,
  ): Promise<Envelope<unknown>> {
    const size = boundedPageSize(
      options.page_size,
      this.client.config.maxPageSize,
    );
    const query: Record<
      string,
      string | number | readonly string[] | undefined
    > = {
      query: options.query,
      page: options.page,
      size,
      scope: options.scope_uuid,
      sort: options.sort,
      dsoType:
        options.dso_type === "all" ? undefined : options.dso_type.toUpperCase(),
    };
    for (const filter of options.filters) {
      query[`f.${filter.field}`] = `${filter.value},${filter.operator}`;
    }

    const response = await this.client.getJson<unknown>(
      "discover/search/objects",
      { query, signal },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const result = getEmbeddedObject<HalDocument>(document, "searchResult");
    if (!result)
      throw NlaError.invalidResponse("Search response omitted searchResult");
    const rawObjects = getEmbedded<SearchObject>(result, "objects");
    const results = rawObjects.map((hit) => {
      const object = asDspaceObject(hit._embedded?.indexableObject);
      const normalized = normalizeDspaceObject(object);
      return {
        ...(options.include_metadata
          ? normalized
          : withoutMetadata(normalized)),
        highlights: hit.hitHighlights ?? {},
      };
    });
    const facets = Array.isArray(document._embedded?.facets)
      ? document._embedded.facets
      : [];

    return this.envelope(
      {
        results,
        facets,
        appliedFilters: document.appliedFilters ?? null,
        query: options.query,
      },
      paginationFrom(result),
      response.source,
      options.page_size > size ? [`page_size was capped at ${size}`] : [],
    );
  }

  async facets(
    options: PageOptions & {
      facet?: string | undefined;
      query?: string | undefined;
      scope_uuid?: string | undefined;
    },
    signal?: AbortSignal,
  ): Promise<Envelope<unknown>> {
    const size = boundedPageSize(
      options.page_size,
      this.client.config.maxPageSize,
    );
    const path = options.facet
      ? `discover/facets/${encodeURIComponent(options.facet)}`
      : "discover/search/objects";
    const response = await this.client.getJson<unknown>(path, {
      query: {
        query: options.query ?? "*",
        scope: options.scope_uuid,
        page: options.page,
        size,
      },
      signal,
    });
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const data = options.facet ? document : (document._embedded?.facets ?? []);
    return this.envelope(data, paginationFrom(document), response.source, []);
  }

  async browse(
    options: PageOptions & {
      index: string;
      filter_value?: string | undefined;
      scope_uuid?: string | undefined;
      sort?: string | undefined;
    },
    signal?: AbortSignal,
  ): Promise<Envelope<unknown>> {
    const size = boundedPageSize(
      options.page_size,
      this.client.config.maxPageSize,
    );
    const mode = options.filter_value ? "items" : "entries";
    const response = await this.client.getJson<unknown>(
      `discover/browses/${encodeURIComponent(options.index)}/${mode}`,
      {
        query: {
          filterValue: options.filter_value,
          scope: options.scope_uuid,
          page: options.page,
          size,
          sort: options.sort,
        },
        signal,
      },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const relation = mode === "items" ? "items" : "entries";
    const values = getEmbedded<unknown>(document, relation).map((entry) =>
      mode === "items" ? normalizeDspaceObject(asDspaceObject(entry)) : entry,
    );
    return this.envelope(
      { mode, values },
      paginationFrom(document),
      response.source,
      [],
    );
  }

  listCommunities(options: PageOptions, signal?: AbortSignal) {
    return this.listObjects("core/communities", "communities", options, signal);
  }

  listCollections(options: PageOptions, signal?: AbortSignal) {
    return this.listObjects("core/collections", "collections", options, signal);
  }

  getCommunity(uuid: string, signal?: AbortSignal) {
    return this.getObject(`core/communities/${uuid}`, signal);
  }

  getCollection(uuid: string, signal?: AbortSignal) {
    return this.getObject(`core/collections/${uuid}`, signal);
  }

  listSubcommunities(uuid: string, options: PageOptions, signal?: AbortSignal) {
    return this.listObjects(
      `core/communities/${uuid}/subcommunities`,
      "subcommunities",
      options,
      signal,
    );
  }

  listCommunityCollections(
    uuid: string,
    options: PageOptions,
    signal?: AbortSignal,
  ) {
    return this.listObjects(
      `core/communities/${uuid}/collections`,
      "collections",
      options,
      signal,
    );
  }

  listCollectionItems(
    collectionUuid: string,
    options: PageOptions & { query: string; sort?: string },
    signal?: AbortSignal,
  ) {
    return this.search(
      {
        query: options.query,
        dso_type: "item",
        scope_uuid: collectionUuid,
        page: options.page,
        page_size: options.page_size,
        ...(options.sort ? { sort: options.sort } : {}),
        filters: [],
        include_metadata: true,
      },
      signal,
    );
  }

  async getItem(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<Envelope<NormalizedDspaceObject>> {
    const resolved = await this.resolveIdentifier(identifier, signal);
    if (resolved.data.type !== "item") {
      throw NlaError.invalidResponse(
        `Identifier resolves to ${resolved.data.type}, not an item`,
      );
    }
    return resolved;
  }

  getItemAccessStatus(identifier: string, signal?: AbortSignal) {
    return this.itemSubresource(identifier, "accessStatus", signal);
  }

  getItemRelationships(identifier: string, signal?: AbortSignal) {
    return this.itemSubresource(identifier, "relationships", signal);
  }

  getItemVersion(identifier: string, signal?: AbortSignal) {
    return this.itemSubresource(identifier, "version", signal);
  }

  getItemIdentifiers(identifier: string, signal?: AbortSignal) {
    return this.itemSubresource(identifier, "identifiers", signal);
  }

  async listItemFiles(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<
    Envelope<{ item: NormalizedDspaceObject; bundles: BundleWithFiles[] }>
  > {
    const item = await this.getItem(identifier, signal);
    const uuid = item.data.normalized.uuid;
    const bundles = await this.content.listItemFiles(uuid, signal);
    return this.envelope(
      {
        item: item.data,
        bundles: bundles.data,
      },
      bundles.pagination,
      bundles.source,
      bundles.warnings,
    );
  }

  async getItemText(
    identifier: string,
    options: {
      bitstreamUuid?: string | undefined;
      offsetChars: number;
      maxChars: number;
    },
    signal?: AbortSignal,
  ) {
    const item = await this.getItem(identifier, signal);
    return this.content.getItemText(
      {
        itemUuid: item.data.normalized.uuid,
        bitstreamUuid: options.bitstreamUuid,
        offsetChars: options.offsetChars,
        maxChars: options.maxChars,
      },
      signal,
    );
  }

  getBitstream(uuid: string, signal?: AbortSignal) {
    return this.content.getBitstream(uuid, signal);
  }

  getFileDownload(uuid: string, signal?: AbortSignal) {
    return this.content.getFileDownload(uuid, signal);
  }

  async resolveIdentifier(
    identifier: string,
    signal?: AbortSignal,
  ): Promise<Envelope<NormalizedDspaceObject>> {
    const path = identifierPath(identifier);
    return this.getObject(path, signal);
  }

  private async itemSubresource(
    identifier: string,
    relation: string,
    signal?: AbortSignal,
  ) {
    const item = await this.getItem(identifier, signal);
    const uuid = item.data.normalized.uuid;
    const response = await this.client.getJson<unknown>(
      `core/items/${uuid}/${relation}`,
      { signal },
    );
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    return this.envelope(
      document,
      paginationFrom(document),
      response.source,
      [],
    );
  }

  private async getObject(
    path: string,
    signal?: AbortSignal,
  ): Promise<Envelope<NormalizedDspaceObject>> {
    const response = await this.client.getJson<unknown>(path, { signal });
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    return this.envelope(
      normalizeDspaceObject(asDspaceObject(document)),
      null,
      response.source,
      [],
    );
  }

  private async listObjects(
    path: string,
    relation: string,
    options: PageOptions,
    signal?: AbortSignal,
  ): Promise<Envelope<NormalizedDspaceObject[]>> {
    const size = boundedPageSize(
      options.page_size,
      this.client.config.maxPageSize,
    );
    const response = await this.client.getJson<unknown>(path, {
      query: { page: options.page, size },
      signal,
    });
    const document = requireHalDocument(response.data);
    validatedLinks(document, this.client.urlPolicy);
    const objects = getEmbedded<unknown>(document, relation).map((entry) =>
      normalizeDspaceObject(asDspaceObject(entry)),
    );
    return this.envelope(
      objects,
      paginationFrom(document),
      response.source,
      options.page_size > size ? [`page_size was capped at ${size}`] : [],
    );
  }

  private envelope<T>(
    data: T,
    pagination: Pagination | null,
    source: Envelope<T>["source"],
    warnings: string[],
  ): Envelope<T> {
    return {
      data,
      pagination,
      source,
      warnings,
      truncated: warnings.length > 0,
    };
  }
}

function withoutMetadata(
  object: NormalizedDspaceObject,
): Omit<NormalizedDspaceObject, "metadata"> {
  return {
    type: object.type,
    name: object.name,
    normalized: object.normalized,
    links: object.links,
  };
}

function identifierPath(identifier: string): string {
  const trimmed = identifier.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed,
    )
  ) {
    return `dso/find?uuid=${encodeURIComponent(trimmed)}`;
  }
  if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    return `pid/find?id=${encodeURIComponent(trimmed)}`;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw NlaError.invalidResponse(
      "Identifier must be a DSpace UUID, handle, or canonical NLA handle URL",
    );
  }
  if (url.protocol !== "https:" || url.hostname !== "dspace.nla.am") {
    throw NlaError.invalidResponse(
      "Only canonical https://dspace.nla.am handle URLs are accepted",
    );
  }
  const match = /^\/handle\/([^/]+\/[^/]+)\/?$/.exec(url.pathname);
  if (!match?.[1])
    throw NlaError.invalidResponse("Canonical NLA URL must contain a handle");
  return `pid/find?id=${encodeURIComponent(match[1])}`;
}
