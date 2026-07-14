import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEvalCorpus } from "../evals/corpus.js";
import { crossProviderConsistency, scoreProviderRun } from "../evals/scorer.js";
import { providerEvalRunSchema } from "../evals/types.js";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error(
    "Usage: npm run eval:score -- <openai-run.json> <anthropic-run.json>",
  );
}

const corpus = loadEvalCorpus();
const runs = paths.map((path) => {
  const absolutePath = resolve(process.cwd(), path);
  return providerEvalRunSchema.parse(
    JSON.parse(readFileSync(absolutePath, "utf8")),
  );
});
const scores = runs.map((run) => scoreProviderRun(corpus, run));
const consistency = crossProviderConsistency(corpus, runs, scores);
process.stdout.write(`${JSON.stringify({ scores, consistency }, null, 2)}\n`);
if (!consistency.passed) process.exitCode = 1;
