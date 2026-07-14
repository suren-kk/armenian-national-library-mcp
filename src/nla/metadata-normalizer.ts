import { sanitizeUnknown } from "../security/output-sanitizer.js";
import type {
  DspaceObject,
  MetadataMap,
  MetadataValue,
  NormalizedDspaceObject,
  NormalizedMetadata,
} from "./types.js";

function values(metadata: MetadataMap, ...keys: string[]): MetadataValue[] {
  return keys.flatMap((key) => metadata[key] ?? []);
}

function booleanOrNull(value: boolean | undefined): boolean | null {
  return value ?? null;
}

export function normalizeMetadata(object: DspaceObject): NormalizedMetadata {
  const metadata = sanitizeUnknown(object.metadata ?? {});
  const uuid = object.uuid ?? object.id;
  if (!uuid)
    throw new Error("Cannot normalize a DSpace object without a UUID or ID");
  const rights = {
    statements: values(metadata, "dc.rights"),
    uris: values(metadata, "dc.rights.uri"),
    holders: values(metadata, "dc.rights.holder"),
    accessRights: values(metadata, "dc.rights.accessRights"),
    licences: values(metadata, "dc.rights.license", "dc.rights.licenseUrl"),
  };
  return {
    uuid,
    handle: object.handle ?? null,
    title: values(metadata, "dc.title", "dc.title.alternative"),
    authors: values(metadata, "dc.contributor.author", "dc.creator"),
    contributors: values(
      metadata,
      "dc.contributor",
      "dc.contributor.editor",
      "dc.contributor.other",
    ),
    subjects: values(
      metadata,
      "dc.subject",
      "dc.subject.other",
      "dc.subject.classification",
    ),
    descriptions: values(
      metadata,
      "dc.description",
      "dc.description.provenance",
    ),
    abstracts: values(metadata, "dc.description.abstract"),
    languages: values(metadata, "dc.language", "dc.language.iso"),
    dateIssued: values(metadata, "dc.date.issued"),
    publisher: values(metadata, "dc.publisher", "dc.publishing.house"),
    publicationPlace: values(metadata, "dc.publication.place"),
    documentType: values(metadata, "dc.type"),
    pages: values(metadata, "dc.pages", "dc.format.extent"),
    identifiers: values(
      metadata,
      "dc.identifier",
      "dc.identifier.uri",
      "dc.identifier.other",
    ),
    rights: {
      status: Object.values(rights).some((entries) => entries.length > 0)
        ? "declared"
        : "unknown",
      ...rights,
      // Source declarations are evidence, not a project determination that
      // downstream reuse is permitted.
      reusable: null,
    },
    canonicalUrl: object.handle
      ? `https://dspace.nla.am/handle/${object.handle}`
      : `https://api.nla.am/server/api/${object.type === "item" ? "core/items" : `dso/find?uuid=`}${uuid}`,
    lastModified: object.lastModified ?? null,
    inArchive: booleanOrNull(object.inArchive),
    discoverable: booleanOrNull(object.discoverable),
    withdrawn: booleanOrNull(object.withdrawn),
  };
}

export function normalizeDspaceObject(
  object: DspaceObject,
): NormalizedDspaceObject {
  return {
    type: object.type,
    name: object.name ? sanitizeUnknown(object.name) : null,
    metadata: sanitizeUnknown(object.metadata ?? {}),
    normalized: normalizeMetadata(object),
  };
}
