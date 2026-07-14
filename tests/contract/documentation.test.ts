import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toolEnvelopeOutputs } from "../../src/schemas/outputs.js";

describe("capability documentation", () => {
  it("documents every registered tool in the README", () => {
    const readme = readFileSync(new URL("../../README.md", import.meta.url), {
      encoding: "utf8",
    });
    const toolNames = [
      "get_repository_info",
      ...Object.keys(toolEnvelopeOutputs),
    ];

    for (const name of toolNames) expect(readme).toContain(`\`${name}\``);
  });
});
