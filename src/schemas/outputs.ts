import { z } from "zod";
import { envelopeSchema } from "./common.js";

const passthroughData = z.unknown();

export const toolEnvelopeOutput = envelopeSchema(passthroughData);

export const healthOutput = z.object({
  status: z.literal("ok"),
  repository: z.literal("National Library of Armenia"),
  profile: z.literal("public-read"),
  transport: z.string(),
  apiBaseUrl: z.url(),
  capabilities: z.array(z.string()),
});
