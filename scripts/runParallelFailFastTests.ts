import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

type CheckName = "Unit" | "Integration" | "Contract" | "Coverage" | "E2E" | "Load";
type CheckStatus = "passed" | "failed" | "skipped";

type Check = {
  name: CheckName;
  label: string;
  command: string[];
  needsWhiteBlueService?: boolean;
  env?: Record<string, string>;
};

const allChecks: Check[] = [
  { name: "Unit", label: "Unit tests", command: npm("run", "test:unit") },
  { name: "Integration", label: "Integration tests", command: npm("run", "test:integration") },
  { name: "Contract", label: "Pact contract tests", command: npm("run", "test:contract") },
  { name: "Coverage", label: "Critical logic coverage gate", command: npm("run", "test:coverage") },
  {
    name: "E2E",
    label: "E2E tests",
    command: npm("run", "test:e2e"),
    needsWhiteBlueService: true,
    env: { WHITEBLUE_SKIP_PLAYWRIGHT_WEBSERVER: "true" }
  },
  {
    name: "Load",
    label: "Load tests",
    command: npm("run", "test:load:docker"),
    needsWhiteBlueService: true,
    env: { BASE_URL: "http://host.docker.internal:4173" }
  }
];
const checks = selectedChecks();

const outputDir = path.resolve("qa-artifacts");
const ciStatusDir = path.join(outputDir, "ci-status");
const healthUrl = "http://127.0.0.1:4173/health";
const activeProcesses = new Map<CheckName | "WhiteBlue", ChildProcess>();
const statuses = new Map<CheckName, CheckStatus>();
let firstFailure: { check: CheckName | "Stopped"; label: string; reason: string } | undefined;
let stopping = false;
let startedWhiteBlueService = false;

mkdirSync(ciStatusDir, { recursive: true });
rmSync(ciStatusDir, { recursive: true, force: true });
mkdirSync(ciStatusDir, { recursive: true });

process.on("SIGINT", () => stopAll("Stopped", "User stop requested."));
process.on("SIGTERM", () => stopAll("Stopped", "User stop requested."));

const exitCode = await main().catch(async (error) => {
  const reason = error instanceof Error ? error.message : String(error);
  firstFailure ??= { check: "Stopped", label: "Parallel test startup", reason };
  for (const check of checks) {
    if (!statuses.has(check.name)) {
      statuses.set(check.name, "skipped");
      writeStatus(check, "skipped", `Skipped because parallel test startup failed. ${reason}`);
    }
  }
  await generateQaReport();
  await cleanup();
  console.error(reason);
  return 1;
});
process.exit(exitCode);

async function main() {
  try {
    await ensureWhiteBlueService();
    const parallelChecks = checks.filter((check) => check.name !== "Coverage");
    const coverageCheck = checks.find((check) => check.name === "Coverage");
    const results = await Promise.all(parallelChecks.map(runCheck));
    if (coverageCheck) {
      results.push(firstFailure ? skipCheck(coverageCheck, firstFailure) : await runCheck(coverageCheck));
    }
    await generateQaReport();
    return results.some((code) => code !== 0) ? 1 : 0;
  } finally {
    await cleanup();
  }
}

async function ensureWhiteBlueService() {
  if (!checks.some((check) => check.needsWhiteBlueService)) {
    return;
  }

  if (await isHealthy()) {
    console.log("WhiteBlue service is already running; reusing it for E2E and load checks.");
    return;
  }

  console.log("Starting shared WhiteBlue service for E2E and load checks.");
  const child = spawnCommand("WhiteBlue", npm("run", "dev"));
  activeProcesses.set("WhiteBlue", child);
  startedWhiteBlueService = true;
  await waitForHealth();
}

async function runCheck(check: Check): Promise<number> {
  if (firstFailure) {
    markSkipped(check, firstFailure);
    return 0;
  }

  console.log(`[${check.label}] starting: ${check.command.join(" ")}`);
  const child = spawnCommand(check.name, check.command, check.env);
  activeProcesses.set(check.name, child);

  const exitCode = await waitForExit(child);
  activeProcesses.delete(check.name);

  if (firstFailure && statuses.get(check.name) === "skipped") {
    return 0;
  }

  if (exitCode === 0) {
    statuses.set(check.name, "passed");
    writeStatus(check, "passed", "");
    console.log(`[${check.label}] passed.`);
    return 0;
  }

  const reason = `${check.label} failed. Other running or pending local checks were skipped by fail-fast.`;
  firstFailure ??= { check: check.name, label: check.label, reason };
  statuses.set(check.name, "failed");
  writeStatus(check, "failed", reason);
  console.log(`[${check.label}] failed with exit code ${exitCode}.`);
  stopOtherChecks(check.name, firstFailure);
  return exitCode || 1;
}

function stopOtherChecks(failedCheck: CheckName, failure: { label: string; reason: string }) {
  for (const check of checks) {
    if (check.name === failedCheck || statuses.has(check.name)) {
      continue;
    }

    markSkipped(check, failure);
    const child = activeProcesses.get(check.name);
    if (child) {
      stopProcessTree(child);
      activeProcesses.delete(check.name);
    }
  }
}

function markSkipped(check: Check, failure: { label: string; reason: string }) {
  statuses.set(check.name, "skipped");
  writeStatus(check, "skipped", `Skipped because of ${failure.label} failure. ${failure.reason}`);
  console.log(`[${check.label}] skipped because of ${failure.label} failure.`);
}

function skipCheck(check: Check, failure: { label: string; reason: string }) {
  markSkipped(check, failure);
  return 0;
}

function writeStatus(check: Check, status: CheckStatus, reason: string) {
  const payload = {
    check: check.name,
    label: check.label,
    status,
    reason
  };
  writeFileSync(path.join(ciStatusDir, `${check.name}.json`), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function spawnCommand(label: string, command: string[], extraEnv: Record<string, string> = {}) {
  const spawnFile = process.platform === "win32" ? "cmd.exe" : command[0];
  const spawnArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", command.map(quoteWindowsArg).join(" ")]
    : command.slice(1);

  const child = spawn(spawnFile, spawnArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BASE_URL: process.env.BASE_URL ?? "http://127.0.0.1:4173",
      PLAYWRIGHT_HTML_OPEN: "never",
      ...extraEnv
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  child.stdout?.on("data", (chunk) => process.stdout.write(prefixLines(label, chunk)));
  child.stderr?.on("data", (chunk) => process.stderr.write(prefixLines(label, chunk)));
  return child;
}

function quoteWindowsArg(value: string) {
  if (!/[()\s^&|<>"]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function prefixLines(label: string, chunk: Buffer) {
  return chunk.toString().split(/\r?\n/).map((line, index, lines) => {
    if (!line && index === lines.length - 1) {
      return "";
    }
    return `[${label}] ${line}\n`;
  }).join("");
}

function waitForExit(child: ChildProcess) {
  return new Promise<number>((resolve) => {
    child.on("exit", (code, signal) => {
      resolve(code ?? (signal ? 1 : 0));
    });
    child.on("error", () => resolve(1));
  });
}

async function stopAll(check: "Stopped", reason: string) {
  if (stopping) {
    return;
  }

  stopping = true;
  firstFailure ??= { check, label: "User stop", reason };
  for (const item of checks) {
    if (!statuses.has(item.name)) {
      statuses.set(item.name, "skipped");
      writeStatus(item, "skipped", `Skipped because execution was stopped. ${reason}`);
    }
  }

  for (const child of activeProcesses.values()) {
    stopProcessTree(child);
  }

  await generateQaReport();
  await cleanup();
  process.exit(130);
}

function stopProcessTree(child: ChildProcess) {
  if (child.killed) {
    return;
  }

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 2_000).unref();
}

async function cleanup() {
  for (const [name, child] of activeProcesses.entries()) {
    if (name === "WhiteBlue" && !startedWhiteBlueService) {
      continue;
    }
    stopProcessTree(child);
  }
  activeProcesses.clear();
  cleanupK6DockerContainers();
}

async function generateQaReport() {
  await new Promise<void>((resolve) => {
    const child = spawnCommand("QA report", npm("run", "test:report"));
    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

async function isHealthy() {
  try {
    const response = await fetch(healthUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await isHealthy()) {
      console.log("Shared WhiteBlue service is ready.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`WhiteBlue service did not become healthy at ${healthUrl}`);
}

function npm(...args: string[]) {
  return [process.platform === "win32" ? "npm.cmd" : "npm", ...args];
}

function selectedChecks() {
  const requested = process.env.WHITEBLUE_PARALLEL_TEST_CHECKS;
  if (!requested) {
    return allChecks;
  }

  const names = new Set(requested.split(",").map((item) => item.trim()).filter(Boolean));
  const selected = allChecks.filter((check) => names.has(check.name));
  if (!selected.length) {
    throw new Error(`WHITEBLUE_PARALLEL_TEST_CHECKS did not match any checks: ${requested}`);
  }
  return selected;
}

function cleanupK6DockerContainers() {
  const ps = spawnSync("docker", ["ps", "-aq", "--filter", "ancestor=grafana/k6:2.0.0"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true
  });
  if (ps.status !== 0 || !ps.stdout.trim()) {
    return;
  }

  const containerIds = ps.stdout.trim().split(/\s+/);
  spawnSync("docker", ["rm", "-f", ...containerIds], {
    stdio: "ignore",
    windowsHide: true
  });
}
