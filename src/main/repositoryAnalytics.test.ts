import { describe, expect, it } from "vite-plus/test";
import {
  AnalyticsHistoryBuilder,
  type AnalyticsHistory,
  type ParsedFileChange
} from "./gitAnalyticsHistory";
import { buildRepositoryAnalytics, groupFolders, mergeIdentities, type TreeSummary } from "./repositoryAnalytics";

const DAY = 86_400;
const NOW = Math.floor(new Date(2026, 9, 8, 12, 0, 0).getTime() / 1000);
const emptyTree: TreeSummary = { files: 0, lfsFiles: 0, lfsBytes: 0, gitBytes: 0, types: [], otherTypes: null, binaryTypesOutsideLfs: [], largeFilesOutsideLfs: [], largeFilesOutsideLfsCount: 0 };

interface CommitSpec {
  daysAgo: number;
  name?: string;
  email?: string;
  parents?: number;
  files?: Array<Partial<ParsedFileChange> & { path: string }>;
  lfs?: Record<string, number>;
}

function history(specs: CommitSpec[]): AnalyticsHistory {
  const builder = new AnalyticsHistoryBuilder();
  const lfs = new Map<string, number>();
  const commits = specs.map((spec, index) => {
    const changes = (spec.files ?? []).map((file, fileIndex) => {
      const blob = (`${index}`.padStart(4, "0") + `${fileIndex}`.padStart(4, "0")).padEnd(40, "a");
      if (spec.lfs?.[file.path] !== undefined) lfs.set(blob, spec.lfs[file.path]!);
      return { status: "M", blob, added: 1, removed: 0, binary: false, ...file };
    });
    return builder.add({
      hash: `${index}`.padStart(40, "0"),
      parentCount: spec.parents ?? 1,
      name: spec.name ?? "Ada",
      email: spec.email ?? "ada@example.test",
      time: NOW - spec.daysAgo * DAY,
      tzOffsetMinutes: 0,
      changes
    });
  });
  builder.applyLfsSizes(lfs);
  return { head: commits[0]?.hash ?? "", commits, paths: builder.paths, identities: builder.identities, truncated: false };
}

function analyze(specs: CommitSpec[], options: { excludePaths?: boolean; patterns?: string[] } = {}) {
  return buildRepositoryAnalytics({
    repoPath: "/repo",
    headHash: "head",
    branch: "main",
    now: NOW,
    history: history(specs),
    excludePaths: options.excludePaths ?? false,
    excludedPathPatterns: options.patterns ?? [],
    tree: emptyTree,
    packedBytes: null,
    branches: { base: null, branches: [], truncated: false },
    tags: []
  });
}

describe("buildRepositoryAnalytics", () => {
  it("places commits in each date window and compares with the previous window", () => {
    const result = analyze([
      { daysAgo: 1, files: [{ path: "a.ts", added: 5, removed: 2 }] },
      { daysAgo: 10, files: [{ path: "a.ts", added: 1, removed: 1 }] },
      { daysAgo: 120 },
      { daysAgo: 200 },
      { daysAgo: 500 },
      { daysAgo: 900 }
    ]);
    expect(result.history).toMatchObject({ commits: 6, truncated: false });
    expect(result.ranges.d90).toMatchObject({ unit: "day" });
    expect(result.ranges.d90.bins).toHaveLength(90);
    expect(result.ranges.d90.kpis).toMatchObject({ commits: 2, previousCommits: 1, activeDays: 2, linesAdded: 6, linesRemoved: 3, contributors: 1 });
    expect(result.ranges.y1.kpis).toMatchObject({ commits: 4, previousCommits: 1 });
    expect(result.ranges.all.kpis).toMatchObject({ commits: 6, previousCommits: null });
    expect(result.ranges.all.unit).toBe("month");
    expect(result.ranges.d90.commits.flat().reduce((total, value) => total + value, 0)).toBe(2);
    expect(result.ranges.d90.punchCard.reduce((total, value) => total + value, 0)).toBe(2);
  });

  it("excludes vendored paths from file statistics but keeps the commits", () => {
    const specs: CommitSpec[] = [
      { daysAgo: 1, files: [{ path: "Plugins/Vendor/lib.cpp", added: 1000, removed: 0 }, { path: "Source/Game.cpp", added: 10, removed: 1 }] },
      { daysAgo: 2, files: [{ path: "Plugins/Vendor/art.uasset", binary: true }] }
    ];
    const included = analyze(specs).ranges.d90;
    const excluded = analyze(specs, { excludePaths: true, patterns: ["Plugins/"] }).ranges.d90;
    expect(included.kpis).toMatchObject({ commits: 2, linesAdded: 1010, assetRevisions: 1 });
    expect(excluded.kpis).toMatchObject({ commits: 2, linesAdded: 10, assetRevisions: 0 });
    expect(excluded.hotspots.map((file) => file.path)).toEqual(["Source/Game.cpp"]);
    expect(excluded.commitSizes).toEqual([1, 0, 1, 0, 0, 0]);
  });

  it("ranks hotspots, ignores lockfiles, and reports coupling without same-name pairs", () => {
    const pair = [{ path: "src/Player.cpp" }, { path: "src/Player.h" }, { path: "src/Camera.cpp" }, { path: "package-lock.json" }];
    const result = analyze([
      { daysAgo: 1, files: pair },
      { daysAgo: 2, files: pair },
      { daysAgo: 3, files: pair },
      { daysAgo: 4, files: [{ path: "src/Player.cpp" }] }
    ]).ranges.d90;
    expect(result.hotspots[0]).toMatchObject({ path: "src/Player.cpp", commits: 4, authors: 1 });
    expect(result.hotspots.some((file) => file.path === "package-lock.json")).toBe(false);
    expect(result.coupling).toEqual([
      { pathA: "src/Player.cpp", pathB: "src/Camera.cpp", together: 3, commitsA: 4, commitsB: 3 },
      { pathA: "src/Player.h", pathB: "src/Camera.cpp", together: 3, commitsA: 3, commitsB: 3 }
    ]);
  });

  it("counts LFS revisions as assets and tracks monthly LFS growth", () => {
    const result = analyze([
      { daysAgo: 1, files: [{ path: "Content/Hero.uasset", added: 2, removed: 2 }], lfs: { "Content/Hero.uasset": 2_000 } },
      { daysAgo: 40, files: [{ path: "Content/Hero.uasset", status: "A", added: 3, removed: 0 }], lfs: { "Content/Hero.uasset": 1_000 } }
    ]);
    expect(result.ranges.all.kpis).toMatchObject({ assetRevisions: 2, linesAdded: 0 });
    expect(result.assets.lfsHistoryBytes).toBe(3_000);
    expect(result.assets.lfsGrowth.reduce((total, month) => total + month.bytes, 0)).toBe(3_000);
    expect(result.assets.binaryHotspots).toEqual([{ path: "Content/Hero.uasset", revisions: 2, lfsBytes: 3_000 }]);
  });

  it("gives the top people their own slots and groups the rest", () => {
    const specs: CommitSpec[] = Array.from({ length: 10 }, (_, index) => ({ daysAgo: 1, name: `Person ${index}`, email: `p${index}@example.test` }));
    const result = analyze(specs);
    expect(result.people).toHaveLength(10);
    expect(result.personSlots).toBe(7);
    expect(result.ranges.d90.commits.find((bin) => bin.some(Boolean))).toHaveLength(8);
    expect(result.ranges.d90.commits.reduce((total, bin) => total + bin[7]!, 0)).toBe(3);
  });

  it("returns empty ranges for a repository without commits", () => {
    const result = buildRepositoryAnalytics({
      repoPath: "/repo", headHash: null, branch: null, now: NOW, history: null, excludePaths: false, excludedPathPatterns: [],
      tree: emptyTree, packedBytes: null, branches: { base: null, branches: [], truncated: false }, tags: []
    });
    expect(result.people).toEqual([]);
    expect(result.ranges.all.bins).toHaveLength(1);
    expect(result.ranges.all.kpis.commits).toBe(0);
  });
});

describe("mergeIdentities", () => {
  it("merges identities through shared emails and names but not generic values", () => {
    const built = history([
      { daysAgo: 1, name: "aida", email: "aiquiti@outlook.com" },
      { daysAgo: 1, name: "aida", email: "aiquiti@outlook.com" },
      { daysAgo: 1, name: "aidan", email: "aidan@example.test" },
      { daysAgo: 1, name: "aida", email: "aidan@example.test" },
      { daysAgo: 1, name: "WORKSTATION\\arizo", email: "aiquiti@outlook.com" },
      { daysAgo: 1, name: "Ben", email: "noreply@github.com" },
      { daysAgo: 1, name: "Cleo", email: "noreply@github.com" },
      { daysAgo: 1, name: "dependabot[bot]", email: "bot@example.test" },
      { daysAgo: 1, name: "dependabot[bot]", email: "other-bot@example.test" }
    ]);
    const { people } = mergeIdentities(built.identities, built.commits);
    expect(people[0]).toMatchObject({ name: "aida", commits: 5 });
    expect(people[0]!.identities.map((identity) => identity.email).sort()).toEqual(["aidan@example.test", "aidan@example.test", "aiquiti@outlook.com", "aiquiti@outlook.com"]);
    expect(people.map((person) => person.name).sort()).toEqual(["Ben", "Cleo", "aida", "dependabot[bot]", "dependabot[bot]"]);
  });
});

describe("groupFolders", () => {
  it("splits a folder that dominates the repository into its subfolders", () => {
    const paths = ["Source/Game/Player/A.cpp", "Source/Game/AI/B.cpp", "Source/Game/Main.cpp", "Docs/readme.md", "build.cs"];
    const revisions = new Map<number, number[]>([[0, [50, 0]], [1, [30, 5]], [2, [10, 0]], [3, [4, 0]], [4, [1, 0]]]);
    expect(groupFolders(revisions, paths, 2)).toEqual([
      { folder: "Source/Game/Player", revisions: [50, 0] },
      { folder: "Source/Game/AI", revisions: [30, 5] },
      { folder: "Source/Game/*", revisions: [10, 0] },
      { folder: "Docs", revisions: [4, 0] },
      { folder: "", revisions: [1, 0] }
    ]);
  });
});
