import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

interface PackResult {
  filename: string;
  files: Array<{ path: string }>;
}

const temporaryRoot = mkdtempSync(join(tmpdir(), "nla-package-check-"));
const npmCache = join(temporaryRoot, "npm-cache");

function runNpm(arguments_: string[], cwd: string): string {
  return execFileSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [...arguments_, "--cache", npmCache],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  try {
    const packed = JSON.parse(
      runNpm(
        [
          "pack",
          "--json",
          "--ignore-scripts",
          "--pack-destination",
          temporaryRoot,
        ],
        repositoryRoot,
      ),
    ) as PackResult[];
    const result = packed[0];
    if (!result) throw new Error("npm pack did not return an artifact");
    const paths = result.files.map((file) => file.path);
    const forbidden = paths.filter(
      (path) =>
        path.endsWith(".d.ts") ||
        path.endsWith(".map") ||
        path.startsWith("dist/evals/") ||
        path.startsWith("dist/release/") ||
        path.startsWith("dist/scripts/") ||
        path.startsWith("evals/") ||
        path.startsWith("docs/"),
    );
    if (forbidden.length > 0) {
      throw new Error(
        `Package contains non-runtime files: ${forbidden.join(", ")}`,
      );
    }
    for (const required of [
      "dist/index.js",
      "dist/server/create-server.js",
      "config/endpoint-matrix.yaml",
    ]) {
      if (!paths.includes(required)) {
        throw new Error(`Package omitted required runtime file: ${required}`);
      }
    }

    const project = join(temporaryRoot, "consumer");
    mkdirSync(project);
    writeFileSync(
      join(project, "package.json"),
      JSON.stringify({ name: "package-check", private: true, type: "module" }),
    );
    const tarball = join(temporaryRoot, result.filename);
    runNpm(
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      project,
    );

    const executable = join(
      project,
      "node_modules",
      ".bin",
      process.platform === "win32"
        ? "nla-research-mcp.cmd"
        : "nla-research-mcp",
    );
    const transport = new StdioClientTransport({
      command: executable,
      cwd: project,
      env: {
        ...process.env,
        PATH: `${join(project, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? ""}`,
        NLA_CACHE_ENABLED: "false",
      },
      stderr: "pipe",
    });
    const client = new Client({
      name: "packed-package-check",
      version: "1.0.0",
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      if (tools.tools.length !== 23) {
        throw new Error(`Packed server advertised ${tools.tools.length} tools`);
      }
      const catalogue = await client.readResource({
        uri: "nla://api/endpoints",
      });
      const content = catalogue.contents[0];
      if (!content || !("text" in content)) {
        throw new Error("Packed server did not return the endpoint catalogue");
      }
      const parsed = JSON.parse(content.text) as {
        data?: { summary?: { totalRelations?: number } };
      };
      if (parsed.data?.summary?.totalRelations !== 80) {
        throw new Error("Packed endpoint catalogue is incomplete");
      }
    } finally {
      await client.close();
    }
    process.stdout.write(
      `Packed package check passed for ${result.filename} (${paths.length} files).\n`,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
