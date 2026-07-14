import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEvalCorpus } from "../../src/evals/corpus.js";
import {
  crossProviderConsistency,
  scoreProviderRun,
} from "../../src/evals/scorer.js";
import {
  compatibilityReportSchema,
  type EvalCorpus,
  type ProviderEvalRun,
} from "../../src/evals/types.js";

function passingRun(
  corpus: EvalCorpus,
  providerFamily: ProviderEvalRun["providerFamily"],
): ProviderEvalRun {
  return {
    schemaVersion: 1,
    providerFamily,
    client: providerFamily === "openai" ? "Codex CLI" : "Claude Code",
    clientVersion: "test",
    model: "test-model",
    serverCommit: "1234567",
    recordedAt: "2026-07-14T00:00:00.000Z",
    cases: corpus.cases.map((testCase) => ({
      caseId: testCase.id,
      completed: true,
      schemaValid: true,
      toolCalls: testCase.expectation.requiredTools,
      grounded: true,
      citationValid: true,
      restrictedHandled: true,
      promptInjectionResisted: true,
      outboundHostRejected: true,
      outputTokens: 100,
      latencyMs: 500,
    })),
  };
}

describe("provider-neutral eval scoring", () => {
  const corpus = loadEvalCorpus();

  it("loads multilingual core and adversarial cases", () => {
    expect(corpus.cases).toHaveLength(22);
    expect(
      corpus.cases.filter((entry) => entry.category === "core"),
    ).toHaveLength(15);
    expect(
      corpus.cases.filter((entry) => entry.category === "adversarial"),
    ).toHaveLength(7);
    expect(new Set(corpus.cases.map((entry) => entry.language))).toEqual(
      new Set(["en", "hy", "ru"]),
    );
  });

  it("passes complete provider runs that satisfy every gate", () => {
    const openaiRun = passingRun(corpus, "openai");
    const anthropicRun = passingRun(corpus, "anthropic");
    const openai = scoreProviderRun(corpus, openaiRun);
    const anthropic = scoreProviderRun(corpus, anthropicRun);

    expect(openai.releasePassed).toBe(true);
    expect(openai.averageToolCalls).toBeGreaterThan(0);
    expect(openai.averageOutputTokens).toBe(100);
    expect(openai.averageLatencyMs).toBe(500);
    expect(openai.schemaValidity.rate).toBe(1);
    expect(openai.coreToolSelection.rate).toBe(1);
    expect(
      crossProviderConsistency(
        corpus,
        [openaiRun, anthropicRun],
        [openai, anthropic],
      ),
    ).toMatchObject({
      passed: true,
      sameServerCommit: true,
      outcomeAgreement: { passed: 22, total: 22, rate: 1 },
      passingProviderFamilies: ["anthropic", "openai"],
    });
  });

  it("rejects matrices with mixed server revisions or duplicate families", () => {
    const openaiRun = passingRun(corpus, "openai");
    const duplicateOpenai = passingRun(corpus, "openai");
    const anthropicRun = passingRun(corpus, "anthropic");
    anthropicRun.serverCommit = "7654321";
    const scores = [
      scoreProviderRun(corpus, openaiRun),
      scoreProviderRun(corpus, duplicateOpenai),
      scoreProviderRun(corpus, anthropicRun),
    ];

    expect(
      crossProviderConsistency(
        corpus,
        [openaiRun, duplicateOpenai, anthropicRun],
        scores,
      ),
    ).toMatchObject({
      passed: false,
      sameServerCommit: false,
      duplicateProviderFamilies: ["openai"],
      serverCommits: ["1234567", "7654321"],
    });
  });

  it("fails incomplete, unsafe, or incorrectly sequenced runs", () => {
    const run = passingRun(corpus, "openai");
    run.cases.shift();
    const injected = run.cases.find(
      (entry) => entry.caseId === "adv-en-metadata-instruction",
    );
    if (!injected) throw new Error("missing injection fixture");
    injected.toolCalls = ["nla_api_get"];
    injected.promptInjectionResisted = false;

    const score = scoreProviderRun(corpus, run);
    expect(score.releasePassed).toBe(false);
    expect(score.missingCaseIds).toEqual(["en-find-author"]);
    expect(score.promptInjectionResistance.passedGate).toBe(false);
  });

  it("validates the recorded real-client compatibility baseline", () => {
    const path = resolve(
      process.cwd(),
      "evals/baselines/client-compatibility-2026-07-14.json",
    );
    const baseline = compatibilityReportSchema.parse(
      JSON.parse(readFileSync(path, "utf8")),
    );

    expect(
      baseline.results.map((entry) => entry.providerFamily).sort(),
    ).toEqual(["anthropic", "openai"]);
    expect(
      baseline.results.every(
        (entry) =>
          entry.connected &&
          entry.schemaValid &&
          entry.groundedResponse &&
          entry.observedToolCalls.length === 1 &&
          entry.observedToolCalls[0] === entry.expectedTool,
      ),
    ).toBe(true);
  });
});
