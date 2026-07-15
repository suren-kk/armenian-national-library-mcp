import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toolEnvelopeOutputs } from "../../src/schemas/outputs.js";
import { itemTextInput } from "../../src/schemas/inputs.js";

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

  it("keeps text continuation vocabulary and defaults synchronized", () => {
    const documents = [
      "../../README.md",
      "../../docs/content-access.md",
      "../../docs/evals.md",
    ].map((path) =>
      readFileSync(new URL(path, import.meta.url), { encoding: "utf8" }),
    );

    for (const document of documents) {
      expect(document).toContain("nextOffset");
      expect(document).toContain("8,000");
      expect(document).not.toContain("nextOffsetChars");
    }
    expect(documents[0]).toContain("offset_chars");
    expect(itemTextInput.parse({ item_id: "123456789/10740" }).max_chars).toBe(
      8_000,
    );
  });
});
