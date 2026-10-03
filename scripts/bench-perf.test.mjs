import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { runPerformanceBenchmarks } from "./bench-perf.mjs";

const name = "parse 1,000-line diff without highlighting";
const stats = {
  aad: 0, critical: 2, df: 9, mad: 0, min: 1, max: 1, mean: 1, moe: 0,
  p50: 1, p75: 1, p99: 1, p995: 1, p999: 1, rme: 0, sd: 0, sem: 0,
  variance: 0, samplesCount: 10
};
const result = { latency: stats, throughput: stats, period: 1, totalTime: 10 };
let root;
let directory;
let baselinePath;
let run;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "githead-bench-"));
  directory = path.join(root, "artifacts/benchmarks");
  baselinePath = path.join(directory, "performance-baseline.json");
  await mkdir(path.join(root, "src/renderer"), { recursive: true });
  await writeFile(path.join(root, "src/renderer/performance.bench.ts"), "workload fixtures and options");
  run = vi.fn(async (_root, env) => {
    await mkdir(env.GITHEAD_BENCH_OUTPUT, { recursive: true });
    await writeFile(path.join(env.GITHEAD_BENCH_OUTPUT, `${encodeURIComponent(name)}.json`), JSON.stringify(result));
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "table").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

async function alterBaseline(change) {
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  change(baseline);
  await writeFile(baselinePath, JSON.stringify(baseline));
}

describe("saved performance benchmarks", () => {
  it("saves a baseline and compares a later run without changing it", async () => {
    await runPerformanceBenchmarks("baseline", { root, run });
    const original = await readFile(baselinePath, "utf8");
    expect(JSON.parse(original).results[name]).toEqual(result);
    await runPerformanceBenchmarks("compare", { root, run });
    expect(await readFile(baselinePath, "utf8")).toBe(original);
    const current = JSON.parse(await readFile(path.join(directory, "performance-current.json"), "utf8"));
    expect(current.results[name]).toEqual(result);
    expect(run.mock.calls[1][1].GITHEAD_BENCH_BASELINE).not.toBe(baselinePath);
    expect(await readdir(directory)).toEqual(["performance-baseline.json", "performance-current.json"]);
  });

  it("requires an explicit saved baseline before comparing", async () => {
    await expect(runPerformanceBenchmarks("compare", { root, run })).rejects.toThrow("bench:perf:baseline");
    expect(run).not.toHaveBeenCalled();
  });

  it.each([[1.25, "+25.00%"], [0.5, "-50.00%"]])("prints measured latency and change for a current mean of %s ms", async (mean, change) => {
    await runPerformanceBenchmarks("baseline", { root, run });
    expect(console.table).not.toHaveBeenCalled();
    run.mockImplementationOnce(async (_root, env) => {
      await mkdir(env.GITHEAD_BENCH_OUTPUT, { recursive: true });
      await writeFile(path.join(env.GITHEAD_BENCH_OUTPUT, `${encodeURIComponent(name)}.json`), JSON.stringify({
        ...result, latency: { ...stats, mean, rme: 3.25 }
      }));
    });
    await runPerformanceBenchmarks("compare", { root, run });
    expect(console.table).toHaveBeenCalledWith([{
      Workload: name,
      "Baseline (ms)": "1.0000",
      "Current (ms)": mean.toFixed(4),
      Change: change,
      "Baseline RME": "0.00%",
      "Current RME": "3.25%"
    }]);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Positive change is slower"));
  });

  it("rejects malformed JSON before starting benchmarks", async () => {
    await mkdir(directory, { recursive: true });
    await writeFile(baselinePath, "{broken");
    await expect(runPerformanceBenchmarks("compare", { root, run })).rejects.toThrow("Cannot read benchmark data");
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    ["missing statistics", (baseline) => { baseline.results[name] = {}; }],
    ["invalid statistics", (baseline) => { baseline.results[name].latency.mean = null; }],
    ["missing results", (baseline) => { baseline.results = {}; }],
    ["different runtime", (baseline) => { baseline.environment.node = "other version"; }]
  ])("rejects %s before starting benchmarks", async (_description, change) => {
    await runPerformanceBenchmarks("baseline", { root, run });
    run.mockClear();
    await alterBaseline(change);
    await expect(runPerformanceBenchmarks("compare", { root, run })).rejects.toThrow("bench:perf:baseline");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects changed workload definitions and permits implementation changes", async () => {
    await runPerformanceBenchmarks("baseline", { root, run });
    await writeFile(path.join(root, "src/renderer/diffProcessing.ts"), "new implementation");
    await expect(runPerformanceBenchmarks("compare", { root, run })).resolves.toBeUndefined();
    await writeFile(path.join(root, "src/renderer/performance.bench.ts"), "different workload");
    run.mockClear();
    await expect(runPerformanceBenchmarks("compare", { root, run })).rejects.toThrow("workload definitions or runtime");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects mismatched workload names without replacing either saved result", async () => {
    await runPerformanceBenchmarks("baseline", { root, run });
    await alterBaseline((baseline) => { baseline.results["missing workload"] = result; });
    const original = await readFile(baselinePath, "utf8");
    await expect(runPerformanceBenchmarks("compare", { root, run })).rejects.toThrow("workload names");
    expect(await readFile(baselinePath, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["performance-baseline.json"]);
  });

  it("preserves a complete baseline when a later measurement fails", async () => {
    await runPerformanceBenchmarks("baseline", { root, run });
    const original = await readFile(baselinePath, "utf8");
    run.mockRejectedValueOnce(new Error("measurement failed"));
    await expect(runPerformanceBenchmarks("baseline", { root, run })).rejects.toThrow("measurement failed");
    expect(await readFile(baselinePath, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["performance-baseline.json"]);
  });
});
