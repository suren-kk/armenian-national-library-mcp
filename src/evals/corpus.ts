import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evalCorpusSchema, type EvalCorpus } from "./types.js";

export function loadEvalCorpus(
  path = resolve(process.cwd(), "evals/corpus.json"),
): EvalCorpus {
  return evalCorpusSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
