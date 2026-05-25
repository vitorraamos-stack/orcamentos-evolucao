import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type NodeRunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const scriptPath = "tools/preflight/check-runtime-contracts.mjs";

const runNode = (
  args: string[],
  env: NodeJS.ProcessEnv = {}
): Promise<NodeRunResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", code => {
      resolve({ code, stdout, stderr });
    });
  });

describe("check-runtime-contracts args", () => {
  it("parseia --strict", async () => {
    const result = await runNode([
      "--input-type=module",
      "--eval",
      `import { parseArgs } from "./${scriptPath}";
console.log(JSON.stringify([parseArgs(["--strict"]), parseArgs([])]));`,
    ]);

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      { strict: true },
      { strict: false },
    ]);
  });

  it("mantem o catalogo minimo de contratos obrigatorios", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("hub_os_update_order_secure");
    expect(source).toContain("os_orders_event");
  });
});

describe("check-runtime-contracts execution", () => {
  it("retorna sucesso em modo nao estrito sem credenciais", async () => {
    const result = await runNode([
      "--input-type=module",
      "--eval",
      `import { runRuntimeContractsCheck } from "./${scriptPath}";
process.exit(await runRuntimeContractsCheck([], {}));`,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("Runtime contracts check skipped");
  });

  it("falha em modo estrito sem credenciais", async () => {
    const result = await runNode([
      "--input-type=module",
      "--eval",
      `import { runRuntimeContractsCheck } from "./${scriptPath}";
process.exit(await runRuntimeContractsCheck(["--strict"], {}));`,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Runtime contracts check skipped");
  });
});
