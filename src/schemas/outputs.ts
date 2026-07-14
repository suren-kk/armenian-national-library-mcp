import { z } from "zod";
import { envelopeSchema } from "./common.js";

const passthroughData = z.unknown();

export const toolEnvelopeOutput = envelopeSchema(passthroughData);

export const healthOutput = z.object({
  status: z.literal("ok"),
  repository: z.literal("National Library of Armenia"),
  projectStatus: z.literal("independent-unofficial-research"),
  maintainer: z.literal("Suren Karapetyan"),
  affiliation: z.literal(
    "Not affiliated with, endorsed by, sponsored by, or operated by the National Library of Armenia",
  ),
  contentRights: z.literal(
    "Technical access is not permission for reuse; source rights may be unknown",
  ),
  profile: z.literal("public-read"),
  transport: z.string(),
  apiBaseUrl: z.url(),
  capabilities: z.array(z.string()),
});
