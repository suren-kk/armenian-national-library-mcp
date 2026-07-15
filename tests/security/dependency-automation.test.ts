import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

interface DependabotUpdate {
  "package-ecosystem"?: unknown;
  directory?: unknown;
  schedule?: { interval?: unknown };
  "target-branch"?: unknown;
}

interface WorkflowStep {
  run?: unknown;
  uses?: unknown;
  with?: Record<string, unknown>;
}

interface Workflow {
  jobs?: Record<string, { steps?: WorkflowStep[] }>;
}

function readYaml(path: string): unknown {
  return parse(readFileSync(path, "utf8")) as unknown;
}

function workflowSteps(path: string): WorkflowStep[] {
  const workflow = readYaml(path) as Workflow;
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function workflowPaths(): string[] {
  const directory = ".github/workflows";
  return readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => join(directory, name));
}

describe("dependency and workflow security automation", () => {
  it("schedules tested updates for every release dependency surface", () => {
    const config = readYaml(".github/dependabot.yml") as {
      version?: unknown;
      updates?: DependabotUpdate[];
    };
    expect(config.version).toBe(2);
    const updates = config.updates ?? [];
    expect(updates.map((update) => update["package-ecosystem"]).sort()).toEqual(
      ["docker", "github-actions", "npm"],
    );
    for (const update of updates) {
      expect(update.directory).toBe("/");
      expect(update.schedule?.interval).toBe("weekly");
      expect(update["target-branch"]).toBeUndefined();
    }
  });

  it("runs advisory scanning in CI and before publication", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/release.yml",
    ]) {
      expect(workflowSteps(path).map((step) => step.run)).toContain(
        "npm run security:audit",
      );
    }
  });

  it("keeps the release SARIF gate aligned with its configured severities", () => {
    const trivyStep = workflowSteps(".github/workflows/release.yml").find(
      (step) =>
        typeof step.uses === "string" &&
        step.uses.startsWith("aquasecurity/trivy-action@"),
    );

    expect(trivyStep?.with?.format).toBe("sarif");
    expect(trivyStep?.with?.severity).toBe("HIGH,CRITICAL");
    expect(trivyStep?.with?.["limit-severities-for-sarif"]).toBe(true);
  });

  it("pins every external workflow action to a full commit", () => {
    for (const path of workflowPaths()) {
      for (const step of workflowSteps(path)) {
        if (typeof step.uses !== "string") continue;
        if (step.uses.startsWith("./")) continue;
        if (step.uses.startsWith("docker://")) {
          expect(step.uses, `${path}: ${step.uses}`).toMatch(
            /^docker:\/\/.+@sha256:[a-f0-9]{64}$/,
          );
          continue;
        }
        expect(step.uses, `${path}: ${step.uses}`).toMatch(
          /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_./-]+)?@[a-f0-9]{40}$/,
        );
      }
    }
  });
});
