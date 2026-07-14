import { z } from "zod";

export const evalExpectationSchema = z.object({
  firstTool: z.string().min(1),
  requiredTools: z.array(z.string().min(1)).min(1),
  forbiddenTools: z.array(z.string().min(1)).default([]),
  requiresGrounding: z.boolean().default(true),
  requiresCitation: z.boolean().default(false),
  restrictedHandling: z.boolean().default(false),
  promptInjectionResistance: z.boolean().default(false),
  outboundHostRejection: z.boolean().default(false),
});

export const evalCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    category: z.enum(["core", "adversarial"]),
    language: z.enum(["en", "hy", "ru"]),
    task: z.string().min(1),
    expectation: evalExpectationSchema,
  })
  .superRefine((testCase, context) => {
    if (
      testCase.expectation.requiredTools[0] !== testCase.expectation.firstTool
    ) {
      context.addIssue({
        code: "custom",
        message: "firstTool must be the first requiredTools entry",
        path: ["expectation", "firstTool"],
      });
    }
    const forbiddenRequired = testCase.expectation.requiredTools.filter(
      (tool) => testCase.expectation.forbiddenTools.includes(tool),
    );
    if (forbiddenRequired.length > 0) {
      context.addIssue({
        code: "custom",
        message: `required tools may not be forbidden: ${[...new Set(forbiddenRequired)].join(", ")}`,
        path: ["expectation", "forbiddenTools"],
      });
    }
  });

export const evalCorpusSchema = z
  .object({
    schemaVersion: z.literal(1),
    cases: z.array(evalCaseSchema).min(1),
  })
  .superRefine((corpus, context) => {
    const ids = new Set<string>();
    for (const [index, testCase] of corpus.cases.entries()) {
      if (ids.has(testCase.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate eval case id: ${testCase.id}`,
          path: ["cases", index, "id"],
        });
      }
      ids.add(testCase.id);
    }
    for (const language of ["en", "hy", "ru"] as const) {
      if (!corpus.cases.some((testCase) => testCase.language === language)) {
        context.addIssue({
          code: "custom",
          message: `eval corpus must include ${language}`,
          path: ["cases"],
        });
      }
    }
    for (const category of ["core", "adversarial"] as const) {
      if (!corpus.cases.some((testCase) => testCase.category === category)) {
        context.addIssue({
          code: "custom",
          message: `eval corpus must include ${category} cases`,
          path: ["cases"],
        });
      }
    }
  });

export const evalCaseResultSchema = z.object({
  caseId: z.string().min(1),
  completed: z.boolean(),
  schemaValid: z.boolean(),
  toolCalls: z.array(z.string().min(1)),
  grounded: z.boolean().optional(),
  citationValid: z.boolean().optional(),
  restrictedHandled: z.boolean().optional(),
  promptInjectionResisted: z.boolean().optional(),
  outboundHostRejected: z.boolean().optional(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  notes: z.string().optional(),
});

export const providerEvalRunSchema = z.object({
  schemaVersion: z.literal(1),
  providerFamily: z.enum(["openai", "anthropic"]),
  client: z.string().min(1),
  clientVersion: z.string().min(1),
  model: z.string().min(1),
  serverCommit: z.string().min(7),
  recordedAt: z.iso.datetime(),
  cases: z.array(evalCaseResultSchema),
});

export const compatibilityResultSchema = z.object({
  providerFamily: z.enum(["openai", "anthropic"]),
  client: z.string().min(1),
  clientVersion: z.string().min(1),
  model: z.string().min(1),
  connected: z.boolean(),
  expectedTool: z.literal("get_repository_info"),
  observedToolCalls: z.array(z.string()),
  schemaValid: z.boolean(),
  groundedResponse: z.boolean(),
  latencyMs: z.number().nonnegative(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative().nullable(),
    cachedInputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    costUsd: z.number().nonnegative().nullable(),
  }),
});

export const compatibilityReportSchema = z.object({
  schemaVersion: z.literal(1),
  recordedAt: z.iso.datetime(),
  serverCommit: z.string().min(7),
  workingTreeDirty: z.boolean(),
  transport: z.literal("stdio"),
  results: z.array(compatibilityResultSchema).min(1),
});

export type EvalCorpus = z.infer<typeof evalCorpusSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type ProviderEvalRun = z.infer<typeof providerEvalRunSchema>;
export type CompatibilityResult = z.infer<typeof compatibilityResultSchema>;
