import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const benchmarkFile = "src/renderer/performance.bench.ts";
const artifactDirectory = "artifacts/benchmarks";
const baselineName = "performance-baseline.json";
const recovery = "Run vp run bench:perf:baseline to record a complete baseline.";

function validateResult(result, name) {
  const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
  const nonnegative = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
  const statistics = (value) => value && positive(value.mean)
    && ["aad", "critical", "df", "mad", "min", "max", "moe", "p50", "p75", "p99", "p995", "p999", "rme", "sd", "sem", "variance"].every((key) => nonnegative(value[key]))
    && Number.isInteger(value.samplesCount) && value.samplesCount > 0
    && (value.samples === undefined || (Array.isArray(value.samples) && value.samples.every(nonnegative)));
  if (!statistics(result?.latency) || !statistics(result?.throughput)
    || !positive(result?.period) || !positive(result?.totalTime)) {
    throw new Error(`Invalid benchmark result for "${name}". ${recovery}`);
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read benchmark data at ${file}. ${recovery}`, { cause });
  }
}

export function printBenchmarkComparison(baseline, current) {
  console.log("Mean latency in milliseconds. Positive change is slower; negative change is faster. RME is relative margin of error.");
  console.table(Object.entries(current).map(([name, result]) => {
    const previous = baseline[name].latency;
    const change = (result.latency.mean / previous.mean - 1) * 100;
    return {
      Workload: name,
      "Baseline (ms)": previous.mean.toFixed(4),
      "Current (ms)": result.latency.mean.toFixed(4),
      Change: `${change > 0 ? "+" : ""}${change.toFixed(2)}%`,
      "Baseline RME": `${previous.rme.toFixed(2)}%`,
      "Current RME": `${result.latency.rme.toFixed(2)}%`
    };
  }));
}

async function runProcess(root, env) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(projectRoot, "node_modules/vite-plus/bin/vp"),
      // Keep measurements independent of modules cached by ordinary tests.
      "test", "bench", benchmarkFile, "--run", "--fsModuleCache=false"
    ], { cwd: root, env: { ...process.env, ...env }, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Benchmarks failed with ${signal ?? `exit code ${code}`}. Saved results were not replaced.`));
    });
  });
}

export async function runPerformanceBenchmarks(mode, { root = projectRoot, run = runProcess } = {}) {
  if (mode !== "baseline" && mode !== "compare") {
    throw new Error("Usage: node scripts/bench-perf.mjs baseline|compare");
  }
  const suite = createHash("sha256").update(await readFile(path.join(root, benchmarkFile))).digest("hex");
  const vitest = await readJson(path.join(projectRoot, "node_modules/vitest/package.json"));
  const environment = {
    node: process.version, v8: process.versions.v8, platform: process.platform,
    arch: process.arch, cpu: cpus()[0]?.model ?? "unknown", vitest: vitest.version
  };
  const directory = path.join(root, artifactDirectory);
  const baselinePath = path.join(directory, baselineName);
  let baseline;
  if (mode === "compare") {
    baseline = await readJson(baselinePath);
    if (baseline?.version !== 1 || baseline.suite !== suite
      || !isDeepStrictEqual(baseline.environment, environment)) {
      throw new Error(`Baseline workload definitions or runtime do not match this run. ${recovery}`);
    }
    if (!baseline.results || typeof baseline.results !== "object" || Array.isArray(baseline.results)
      || !Object.keys(baseline.results).length) {
      throw new Error(`Baseline has no benchmark results. ${recovery}`);
    }
    for (const [name, result] of Object.entries(baseline.results)) validateResult(result, name);
    console.log(`Comparing with ${baselinePath}, recorded ${baseline.createdAt}.`);
  }

  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(path.join(directory, ".performance-"));
  try {
    const output = path.join(staging, "results");
    const snapshot = path.join(staging, "baseline.json");
    if (baseline) await writeFile(snapshot, JSON.stringify(baseline));
    await run(root, {
      GITHEAD_BENCH_OUTPUT: output,
      GITHEAD_BENCH_BASELINE: baseline ? snapshot : ""
    });
    const results = {};
    for (const file of await readdir(output)) {
      const name = decodeURIComponent(file.replace(/\.json$/, ""));
      const result = await readJson(path.join(output, file));
      validateResult(result, name);
      results[name] = result;
    }
    if (!Object.keys(results).length
      || (baseline && !isDeepStrictEqual(Object.keys(results).sort(), Object.keys(baseline.results).sort()))) {
      throw new Error(`Benchmark workload names do not match the saved baseline. ${recovery}`);
    }
    const destination = path.join(directory, mode === "baseline" ? baselineName : "performance-current.json");
    const saved = path.join(staging, "complete.json");
    await writeFile(saved, `${JSON.stringify({ version: 1, suite, environment, createdAt: new Date().toISOString(), results }, null, 2)}\n`);
    await rename(saved, destination);
    if (baseline) printBenchmarkComparison(baseline.results, results);
    console.log(`Saved ${Object.keys(results).length} benchmark results to ${destination}.`);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node scripts/bench-perf.mjs baseline|compare");
    await runPerformanceBenchmarks(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
