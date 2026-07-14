import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");

const forbiddenDependencies: Readonly<Record<string, readonly string[]>> = {
  nla: ["tools", "resources", "server", "transports"],
  security: ["tools", "resources", "server", "transports", "schemas"],
  schemas: ["tools", "resources", "server", "transports"],
  resources: ["tools", "server", "transports"],
  tools: ["resources", "transports"],
  server: ["transports"],
  observability: [
    "nla",
    "security",
    "schemas",
    "resources",
    "tools",
    "server",
    "transports",
  ],
};

function typeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? typeScriptFiles(path)
      : entry.name.endsWith(".ts")
        ? [path]
        : [];
  });
}

describe("architectural dependencies", () => {
  it("keeps lower layers independent of MCP composition and transports", () => {
    const violations: string[] = [];
    for (const [layer, forbidden] of Object.entries(forbiddenDependencies)) {
      const directory = join(sourceRoot, layer);
      for (const file of typeScriptFiles(directory)) {
        const source = readFileSync(file, "utf8");
        for (const target of forbidden) {
          const pattern = new RegExp(
            `from\\s+["'](?:\\.\\./)+${target}(?:/|["'])`,
            "g",
          );
          if (pattern.test(source)) {
            violations.push(
              `${relative(process.cwd(), file)} imports forbidden ${target} layer`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
