import { compileExcludedPaths } from "../shared/analyticsPathFilter";
import type {
  AnalyticsAssets,
  AnalyticsBinaryHotspot,
  AnalyticsBinUnit,
  AnalyticsBranches,
  AnalyticsContributor,
  AnalyticsCoupledFiles,
  AnalyticsFileType,
  AnalyticsFolderOwnership,
  AnalyticsHotspot,
  AnalyticsLargeFile,
  AnalyticsPerson,
  AnalyticsRange,
  AnalyticsRangeKey,
  RepositoryAnalytics
} from "../shared/types";
import { addLocalDays, binIndex, binStarts, startOfLocalDay, startOfLocalMonth, startOfLocalWeek } from "./analyticsTime";
import {
  CHANGE_BINARY,
  CHANGE_DELETED,
  CHANGE_LFS,
  CHANGE_STRIDE,
  type AnalyticsHistory,
  type HistoryCommit
} from "./gitAnalyticsHistory";

/** People beyond this many share one "everyone else" slot so colors stay distinguishable. */
export const MAX_PERSON_SLOTS = 8;
const TOP_LIST_LIMIT = 10;
const OWNERSHIP_LIMIT = 8;
const COUPLING_LIMIT = 8;
const COUPLING_MAX_FILES = 12;
const COUPLING_MIN_TOGETHER = 3;
const FOLDER_MAX_DEPTH = 4;
const CONTRIBUTOR_LIMIT = 12;

const LOCKFILES = new Set([
  "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock", "cargo.lock", "gemfile.lock",
  "poetry.lock", "composer.lock", "go.sum", "pipfile.lock", "packages.lock.json", "podfile.lock", "flake.lock", "uv.lock"
]);
const GENERIC_EMAILS = new Set(["", "noreply@github.com", "none@none", "unknown", "root@localhost", "(none)"]);
const GENERIC_NAMES = new Set(["", "unknown", "root", "admin", "administrator", "user", "github", "github-actions", "dependabot", "renovate"]);

export interface TreeSummary {
  files: number;
  lfsFiles: number;
  lfsBytes: number;
  gitBytes: number;
  types: AnalyticsFileType[];
  otherTypes: AnalyticsFileType | null;
  binaryTypesOutsideLfs: Array<AnalyticsFileType & { example: string }>;
  largeFilesOutsideLfs: AnalyticsLargeFile[];
  largeFilesOutsideLfsCount: number;
}

export interface BuildRepositoryAnalyticsInput {
  repoPath: string;
  headHash: string | null;
  branch: string | null;
  /** Unix seconds. Every date window ends here. */
  now: number;
  history: AnalyticsHistory | null;
  excludePaths: boolean;
  excludedPathPatterns: string[];
  tree: TreeSummary;
  packedBytes: number | null;
  branches: AnalyticsBranches;
  tags: Array<{ name: string; time: number }>;
}

export function buildRepositoryAnalytics(input: BuildRepositoryAnalyticsInput): RepositoryAnalytics {
  const commits = input.history?.commits ?? [];
  const paths = input.history?.paths ?? [];
  const isExcluded = input.excludePaths ? compileExcludedPaths(input.excludedPathPatterns) : () => false;
  const excludedPath = memoizePathFlags(paths, isExcluded);
  const lockfile = memoizePathFlags(paths, (path) => LOCKFILES.has(basename(path).toLowerCase()));
  const { people, personOfIdentity } = mergeIdentities(input.history?.identities ?? [], commits);
  const personSlots = people.length <= MAX_PERSON_SLOTS ? people.length : MAX_PERSON_SLOTS - 1;
  const context: RangeContext = { commits, paths, excludedPath, lockfile, personOfIdentity, personSlots, now: input.now };
  const oldest = commits.at(-1)?.time ?? null;
  const newest = commits[0]?.time ?? null;

  const ranges: Record<AnalyticsRangeKey, AnalyticsRange> = {
    d90: buildRange(context, rangeWindow("d90", input.now, oldest)),
    y1: buildRange(context, rangeWindow("y1", input.now, oldest)),
    all: buildRange(context, rangeWindow("all", input.now, oldest))
  };

  return {
    repoPath: input.repoPath,
    headHash: input.headHash,
    branch: input.branch,
    generatedAt: input.now,
    excludePaths: input.excludePaths,
    excludedPathPatterns: input.excludedPathPatterns,
    history: { commits: commits.length, firstCommitAt: oldest, lastCommitAt: newest, truncated: input.history?.truncated ?? false },
    people,
    personSlots,
    ranges,
    tags: input.tags,
    assets: buildAssets(input, commits, paths),
    branches: input.branches
  };
}

interface RangeContext {
  commits: HistoryCommit[];
  paths: string[];
  excludedPath: (id: number) => boolean;
  lockfile: (id: number) => boolean;
  personOfIdentity: Int32Array;
  personSlots: number;
  now: number;
}

interface RangeWindow {
  unit: AnalyticsBinUnit;
  bins: number[];
  from: number;
  to: number;
}

export function rangeWindow(key: AnalyticsRangeKey, now: number, oldestCommit: number | null): RangeWindow {
  const today = startOfLocalDay(now);
  let unit: AnalyticsBinUnit;
  let from: number;
  if (key === "d90") {
    unit = "day";
    from = addLocalDays(today, -89);
  } else if (key === "y1") {
    unit = "week";
    from = startOfLocalWeek(addLocalDays(today, -364));
  } else {
    unit = "month";
    from = startOfLocalMonth(Math.min(oldestCommit ?? now, now));
  }
  return { unit, bins: binStarts(from, now, unit), from, to: now };
}

function buildRange(context: RangeContext, window: RangeWindow): AnalyticsRange {
  const { commits, paths, excludedPath, lockfile, personOfIdentity, personSlots } = context;
  const slotCount = personSlots + 1;
  const slotOf = (person: number) => (person < personSlots ? person : personSlots);
  const binCount = window.bins.length;
  const commitBins = Array.from({ length: binCount }, () => zeros(slotCount));
  const lines = Array.from({ length: binCount }, () => [0, 0] as [number, number]);
  const punchCard = zeros(168);
  const commitSizes = zeros(6);
  const activeDays = new Set<number>();
  const previousDays = new Set<number>();
  const previousFrom = window.from - (window.to - window.from);
  let previousCommits = 0;
  let rangeCommits = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  let assetRevisions = 0;
  const contributors = new Map<number, AnalyticsContributor & { days: Set<number> }>();
  const files = new Map<number, { commits: number; added: number; removed: number; people: Set<number> }>();
  const revisionsByPath = new Map<number, number[]>();
  const pairs = new Map<string, number>();

  for (const commit of commits) {
    const time = commit.time;
    if (time < window.from || time > window.to) {
      if (time >= previousFrom && time < window.from) {
        previousCommits += 1;
        previousDays.add(startOfLocalDay(time));
      }
      continue;
    }
    const bin = binIndex(window.bins, time);
    if (bin < 0) continue;
    const person = personOfIdentity[commit.identity] ?? 0;
    const slot = slotOf(person);
    rangeCommits += 1;
    commitBins[bin]![slot]! += 1;
    const day = startOfLocalDay(time);
    activeDays.add(day);
    const local = new Date((time + commit.tzOffsetMinutes * 60) * 1000);
    punchCard[((local.getUTCDay() + 6) % 7) * 24 + local.getUTCHours()]! += 1;

    let contributor = contributors.get(person);
    if (!contributor) {
      contributor = { person, commits: 0, activeDays: 0, linesAdded: 0, linesRemoved: 0, assetRevisions: 0, firstCommitAt: time, lastCommitAt: time, days: new Set() };
      contributors.set(person, contributor);
    }
    contributor.commits += 1;
    contributor.days.add(day);
    contributor.firstCommitAt = Math.min(contributor.firstCommitAt, time);
    contributor.lastCommitAt = Math.max(contributor.lastCommitAt, time);

    let commitAdded = 0;
    let commitRemoved = 0;
    const coupled: number[] = [];
    const changes = commit.changes;
    for (let offset = 0; offset < changes.length; offset += CHANGE_STRIDE) {
      const pathId = changes[offset]!;
      if (excludedPath(pathId)) continue;
      const flags = changes[offset + 3]!;
      let revisions = revisionsByPath.get(pathId);
      if (!revisions) {
        revisions = zeros(slotCount);
        revisionsByPath.set(pathId, revisions);
      }
      revisions[slot]! += 1;
      if (flags & (CHANGE_BINARY | CHANGE_LFS)) {
        assetRevisions += 1;
        contributor.assetRevisions += 1;
        continue;
      }
      const added = changes[offset + 1]!;
      const removed = changes[offset + 2]!;
      commitAdded += added;
      commitRemoved += removed;
      if (lockfile(pathId)) continue;
      let file = files.get(pathId);
      if (!file) {
        file = { commits: 0, added: 0, removed: 0, people: new Set() };
        files.set(pathId, file);
      }
      file.commits += 1;
      file.added += added;
      file.removed += removed;
      file.people.add(person);
      if (!(flags & CHANGE_DELETED)) coupled.push(pathId);
    }
    lines[bin]![0] += commitAdded;
    lines[bin]![1] += commitRemoved;
    linesAdded += commitAdded;
    linesRemoved += commitRemoved;
    contributor.linesAdded += commitAdded;
    contributor.linesRemoved += commitRemoved;
    if (!commit.merge) commitSizes[sizeBucket(commitAdded + commitRemoved)]! += 1;
    // Bulk commits pair everything with everything and drown out real coupling.
    if (!commit.merge && coupled.length >= 2 && coupled.length <= COUPLING_MAX_FILES) {
      coupled.sort((a, b) => a - b);
      for (let i = 0; i < coupled.length; i += 1) {
        for (let j = i + 1; j < coupled.length; j += 1) {
          const a = coupled[i]!;
          const b = coupled[j]!;
          if (stem(paths[a]!) === stem(paths[b]!)) continue;
          const key = `${a},${b}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const hotspots: AnalyticsHotspot[] = [...files.entries()]
    .sort((a, b) => b[1].commits - a[1].commits || (b[1].added + b[1].removed) - (a[1].added + a[1].removed))
    .slice(0, TOP_LIST_LIMIT)
    .map(([pathId, file]) => ({ path: paths[pathId]!, commits: file.commits, linesAdded: file.added, linesRemoved: file.removed, authors: file.people.size }));

  const coupling: AnalyticsCoupledFiles[] = [...pairs.entries()]
    .filter(([, together]) => together >= COUPLING_MIN_TOGETHER)
    .sort((a, b) => b[1] - a[1])
    .slice(0, COUPLING_LIMIT)
    .map(([key, together]) => {
      const [a, b] = key.split(",").map(Number) as [number, number];
      return { pathA: paths[a]!, pathB: paths[b]!, together, commitsA: files.get(a)?.commits ?? 0, commitsB: files.get(b)?.commits ?? 0 };
    });

  return {
    unit: window.unit,
    from: window.from,
    to: window.to,
    bins: window.bins,
    commits: commitBins,
    lines,
    punchCard,
    commitSizes,
    kpis: {
      commits: rangeCommits,
      previousCommits: window.unit === "month" ? null : previousCommits,
      activeDays: activeDays.size,
      previousActiveDays: window.unit === "month" ? null : previousDays.size,
      linesAdded,
      linesRemoved,
      assetRevisions,
      contributors: contributors.size
    },
    contributors: [...contributors.values()]
      .sort((a, b) => b.commits - a.commits)
      .slice(0, CONTRIBUTOR_LIMIT)
      .map(({ days, ...contributor }) => ({ ...contributor, activeDays: days.size })),
    hotspots,
    ownership: groupFolders(revisionsByPath, paths, slotCount),
    coupling
  };
}

/**
 * Groups file revisions by folder. Starts with top-level folders and splits any
 * folder that holds more than 40% of all revisions into its subfolders, so a
 * repository with one dominant folder still shows meaningful areas.
 */
export function groupFolders(revisionsByPath: ReadonlyMap<number, number[]>, paths: readonly string[], slotCount: number): AnalyticsFolderOwnership[] {
  const prefixes = new Map<string, { revisions: number[]; children: Set<string>; direct: number[] }>();
  const entry = (prefix: string) => {
    let value = prefixes.get(prefix);
    if (!value) {
      value = { revisions: zeros(slotCount), children: new Set(), direct: zeros(slotCount) };
      prefixes.set(prefix, value);
    }
    return value;
  };
  let total = 0;
  for (const [pathId, revisions] of revisionsByPath) {
    const segments = (paths[pathId] ?? "").split("/");
    segments.pop();
    const depth = Math.min(segments.length, FOLDER_MAX_DEPTH);
    let parent = "";
    const rootEntry = entry("");
    addInto(rootEntry.revisions, revisions);
    if (depth === 0) addInto(rootEntry.direct, revisions);
    for (let index = 0; index < depth; index += 1) {
      const prefix = segments.slice(0, index + 1).join("/");
      entry(parent).children.add(prefix);
      const folder = entry(prefix);
      addInto(folder.revisions, revisions);
      if (index === depth - 1 && depth === segments.length) addInto(folder.direct, revisions);
      parent = prefix;
    }
    total += sum(revisions);
  }
  if (total === 0) return [];

  const groups = new Map<string, number[]>();
  const root = prefixes.get("")!;
  for (const child of root.children) groups.set(child, prefixes.get(child)!.revisions);
  if (sum(root.direct) > 0) groups.set("", root.direct);
  for (let step = 0; step < 8; step += 1) {
    let largest: string | null = null;
    for (const [folder, revisions] of groups) {
      const node = prefixes.get(folder);
      if (!folder || !node || node.children.size === 0 || folder.split("/").length >= FOLDER_MAX_DEPTH) continue;
      if (sum(revisions) / total > 0.4 && (largest === null || sum(revisions) > sum(groups.get(largest)!))) largest = folder;
    }
    if (largest === null) break;
    const node = prefixes.get(largest)!;
    groups.delete(largest);
    for (const child of node.children) groups.set(child, prefixes.get(child)!.revisions);
    if (sum(node.direct) > 0) groups.set(`${largest}/*`, node.direct);
  }
  return [...groups.entries()]
    .sort((a, b) => sum(b[1]) - sum(a[1]))
    .slice(0, OWNERSHIP_LIMIT)
    .map(([folder, revisions]) => ({ folder, revisions: [...revisions] }));
}

function buildAssets(input: BuildRepositoryAnalyticsInput, commits: HistoryCommit[], paths: string[]): AnalyticsAssets {
  const months = rangeWindow("all", input.now, commits.at(-1)?.time ?? null).bins;
  const growth = zeros(months.length);
  const binary = new Map<number, { revisions: number; lfsBytes: number; lfs: boolean }>();
  let lfsHistoryBytes = 0;
  for (const commit of commits) {
    const changes = commit.changes;
    for (let offset = 0, index = 0; offset < changes.length; offset += CHANGE_STRIDE, index += 1) {
      const flags = changes[offset + 3]!;
      if (!(flags & (CHANGE_BINARY | CHANGE_LFS)) || flags & CHANGE_DELETED) continue;
      const pathId = changes[offset]!;
      const size = flags & CHANGE_LFS ? commit.lfsSizes?.[index] ?? 0 : 0;
      const file = binary.get(pathId) ?? { revisions: 0, lfsBytes: 0, lfs: false };
      file.revisions += 1;
      file.lfsBytes += size;
      file.lfs ||= Boolean(flags & CHANGE_LFS);
      binary.set(pathId, file);
      if (size > 0) {
        lfsHistoryBytes += size;
        const bin = binIndex(months, commit.time);
        if (bin >= 0) growth[bin]! += size;
      }
    }
  }
  const binaryHotspots: AnalyticsBinaryHotspot[] = [...binary.entries()]
    .sort((a, b) => b[1].revisions - a[1].revisions || b[1].lfsBytes - a[1].lfsBytes)
    .slice(0, TOP_LIST_LIMIT)
    .map(([pathId, file]) => ({ path: paths[pathId]!, revisions: file.revisions, lfsBytes: file.lfs ? file.lfsBytes : null }));
  const { tree } = input;
  return {
    treeFiles: tree.files,
    lfsFiles: tree.lfsFiles,
    lfsBytes: tree.lfsBytes,
    gitBytes: tree.gitBytes,
    packedBytes: input.packedBytes,
    types: tree.types,
    otherTypes: tree.otherTypes,
    lfsGrowth: months.map((month, index) => ({ month, bytes: growth[index]! })),
    lfsHistoryBytes,
    binaryHotspots,
    binaryTypesOutsideLfs: tree.binaryTypesOutsideLfs,
    largeFilesOutsideLfs: tree.largeFilesOutsideLfs,
    largeFilesOutsideLfsCount: tree.largeFilesOutsideLfsCount
  };
}

/**
 * Groups author identities that share an email address or a distinctive name,
 * the way a `.mailmap` would. Generic values such as GitHub's shared noreply
 * address never merge different people.
 */
export function mergeIdentities(
  identities: ReadonlyArray<{ name: string; email: string }>,
  commits: readonly HistoryCommit[]
): { people: AnalyticsPerson[]; personOfIdentity: Int32Array } {
  const counts = zeros(identities.length);
  for (const commit of commits) counts[commit.identity] = (counts[commit.identity] ?? 0) + 1;
  const parent = identities.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]!]!;
      index = parent[index]!;
    }
    return index;
  };
  const byKey = new Map<string, number>();
  identities.forEach((identity, index) => {
    const email = identity.email.trim().toLowerCase();
    const name = identity.name.trim().toLowerCase();
    const keys: string[] = [];
    if (!GENERIC_EMAILS.has(email)) keys.push(`e:${email}`);
    if (!GENERIC_NAMES.has(name) && !name.endsWith("[bot]") && /\p{L}/u.test(name)) keys.push(`n:${name}`);
    for (const key of keys) {
      const other = byKey.get(key);
      if (other === undefined) byKey.set(key, index);
      else parent[find(index)] = find(other);
    }
  });
  const groups = new Map<number, number[]>();
  identities.forEach((_, index) => {
    if (!counts[index]) return;
    const root = find(index);
    const members = groups.get(root);
    if (members) members.push(index);
    else groups.set(root, [index]);
  });
  const people = [...groups.values()].map((members) => {
    const sorted = [...members].sort((a, b) => counts[b]! - counts[a]!);
    const names = new Map<string, number>();
    for (const member of sorted) {
      const name = identities[member]!.name.trim();
      if (name) names.set(name, (names.get(name) ?? 0) + counts[member]!);
    }
    const readable = [...names.entries()].filter(([name]) => !name.includes("@") && !name.includes("\\"));
    const display = (readable.length ? readable : [...names.entries()]).sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? identities[sorted[0]!]!.email;
    return {
      members: sorted,
      person: {
        name: display,
        commits: sorted.reduce((total, member) => total + counts[member]!, 0),
        identities: sorted.map((member) => ({ name: identities[member]!.name, email: identities[member]!.email, commits: counts[member]! }))
      }
    };
  }).sort((a, b) => b.person.commits - a.person.commits || a.person.name.localeCompare(b.person.name));
  const personOfIdentity = new Int32Array(identities.length);
  people.forEach(({ members }, index) => {
    for (const member of members) personOfIdentity[member] = index;
  });
  return { people: people.map(({ person }) => person), personOfIdentity };
}

function memoizePathFlags(paths: readonly string[], test: (path: string) => boolean): (id: number) => boolean {
  const cache = new Int8Array(paths.length);
  return (id) => {
    const cached = cache[id];
    if (cached) return cached === 1;
    const value = test(paths[id] ?? "");
    cache[id] = value ? 1 : 2;
    return value;
  };
}

function sizeBucket(lines: number): number {
  if (lines === 0) return 0;
  if (lines <= 10) return 1;
  if (lines <= 50) return 2;
  if (lines <= 200) return 3;
  if (lines <= 1000) return 4;
  return 5;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** File name up to the first dot, so `Foo.h`, `Foo.cpp`, and `Foo.generated.h` share a stem. */
function stem(path: string): string {
  const name = basename(path);
  const dot = name.indexOf(".", 1);
  return (dot === -1 ? name : name.slice(0, dot)).toLowerCase();
}

function zeros(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function addInto(target: number[], values: readonly number[]): void {
  for (let index = 0; index < values.length; index += 1) target[index]! += values[index]!;
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
