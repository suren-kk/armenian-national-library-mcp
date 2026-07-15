import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

async function availableLoopbackPort(): Promise<number> {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to allocate a package-test HTTP port");
  }
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForHealth(url: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Packed HTTP server did not become healthy: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function checkPackedHttp(
  executable: string,
  project: string,
): Promise<void> {
  const port = await availableLoopbackPort();
  let stderr = "";
  const child = spawn(executable, [], {
    cwd: project,
    env: {
      ...process.env,
      MCP_TRANSPORT: "http",
      MCP_HOST: "127.0.0.1",
      MCP_PORT: String(port),
      MCP_ALLOWED_HOSTS: "127.0.0.1",
      MCP_ALLOWED_ORIGINS: "http://127.0.0.1",
      MCP_AUTH_MODE: "local",
      NLA_CACHE_ENABLED: "false",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    if (stderr.length < 16_384) stderr += chunk;
  });
  const client = new Client({ name: "packed-http-check", version: "1.0.0" });
  try {
    await waitForHealth(`http://127.0.0.1:${port}/healthz`);
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`),
    );
    await client.connect(
      transport as unknown as Parameters<Client["connect"]>[0],
    );
    const tools = await client.listTools();
    if (tools.tools.length !== 23) {
      throw new Error(
        `Packed HTTP server advertised ${tools.tools.length} tools`,
      );
    }
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}${stderr ? `\nPacked HTTP stderr:\n${stderr}` : ""}`,
      { cause: error },
    );
  } finally {
    await client.close().catch(() => undefined);
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
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
        ? "armenian-national-library-mcp.cmd"
        : "armenian-national-library-mcp",
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
    await checkPackedHttp(executable, project);
    process.stdout.write(
      `Packed package stdio/HTTP check passed for ${result.filename} (${paths.length} files).\n`,
    );
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
