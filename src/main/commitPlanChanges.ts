import { createHash } from "node:crypto";
import type {
  CommitPlanChange,
  CommitPlanGranularity,
  GitFileDiff,
  GitImageSide
} from "../shared/types";
import { groupDiffRowsByHunk, parseUnifiedDiff, type DiffRowGroup } from "../shared/diffParser";

export { MAX_COMMIT_PLAN_CHANGES } from "../shared/commitPlanLimits";

export interface PreparedCommitPlanChange extends CommitPlanChange {
  patch: string | null;
  promptText: string;
}

export function createCommitPlanChanges(
  diffs: GitFileDiff[],
  granularity: CommitPlanGranularity
): PreparedCommitPlanChange[] {
  const changes = diffs.flatMap((diff) => granularity === "hunk"
    ? createHunkChanges(diff)
    : [createFileChange(diff)]);

  return changes.map((change, index) => ({
    ...change,
    id: `change-${index + 1}`
  }));
}

export function toPublicCommitPlanChange(change: PreparedCommitPlanChange): CommitPlanChange {
  return {
    id: change.id,
    path: change.path,
    kind: change.kind,
    label: change.label,
    fingerprint: change.fingerprint,
    ...(change.contextIncomplete ? { contextIncomplete: true } : {})
  };
}

export function combineHunkPatches(changes: PreparedCommitPlanChange[]): string {
  const byPath = new Map<string, { headers: string[]; hunks: string[][] }>();

  for (const change of changes) {
    if (change.kind !== "hunk" || !change.patch) continue;
    const lines = splitLines(change.patch);
    const hunkIndex = lines.findIndex((line) => line.startsWith("@@ "));
    if (hunkIndex < 0) continue;
    const current = byPath.get(change.path);
    if (current) {
      current.hunks.push(lines.slice(hunkIndex));
    } else {
      byPath.set(change.path, {
        headers: lines.slice(0, hunkIndex),
        hunks: [lines.slice(hunkIndex)]
      });
    }
  }

  const sections = [...byPath.values()].flatMap(({ headers, hunks }) => [
    ...headers,
    ...hunks.flat()
  ]);
  return sections.length > 0 ? `${sections.join("\n")}\n` : "";
}

function createHunkChanges(diff: GitFileDiff): PreparedCommitPlanChange[] {
  if (diff.kind !== "text" || diff.truncated || hasWholeFileMetadata(diff.text)) {
    return [createFileChange(diff)];
  }

  const groups = groupDiffRowsByHunk(parseUnifiedDiff(diff.text))
    .filter((group): group is DiffRowGroup & { patch: string } => group.kind === "hunk" && Boolean(group.patch));
  if (groups.length === 0) return [createFileChange(diff)];

  const changes = groups.map((group) => createHunkChange(diff.path, group));
  const fingerprints = new Set<string>();
  for (const change of changes) {
    if (fingerprints.has(change.fingerprint)) return [createFileChange(diff)];
    fingerprints.add(change.fingerprint);
  }
  return changes;
}

function createHunkChange(path: string, group: DiffRowGroup & { patch: string }): PreparedCommitPlanChange {
  const header = group.rows[0]?.patchLine ?? "Changed hunk";
  const canonicalLines = group.rows.flatMap((row, index) => {
    if (index === 0) return [header.replace(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/, "@@ @@")];
    return row.patchLine ? [row.patchLine] : [];
  });
  return {
    id: "",
    path,
    kind: "hunk",
    label: header,
    fingerprint: hashParts(["hunk", path, ...canonicalLines]),
    patch: group.patch,
    promptText: group.patch.trim()
  };
}

function createFileChange(diff: GitFileDiff): PreparedCommitPlanChange {
  return {
    id: "",
    path: diff.path,
    kind: "file",
    label: "Whole file",
    fingerprint: fingerprintFileDiff(diff),
    patch: null,
    ...(diff.kind !== "text" || diff.truncated ? { contextIncomplete: true } : {}),
    promptText: describeFileDiff(diff)
  };
}

function fingerprintFileDiff(diff: GitFileDiff): string {
  const hash = createHash("sha256");
  hash.update("file\0");
  hash.update(diff.path);
  hash.update("\0");
  hash.update(diff.kind);
  hash.update("\0");

  if (diff.kind === "image") {
    updateImageSideHash(hash, diff.before);
    updateImageSideHash(hash, diff.after);
  } else {
    hash.update(diff.text);
    if (diff.kind === "text") hash.update(diff.truncated ? "\0truncated" : "\0complete");
  }
  return hash.digest("hex");
}

function updateImageSideHash(hash: ReturnType<typeof createHash>, side: GitImageSide): void {
  hash.update(side.status);
  hash.update("\0");
  if (side.status === "available") {
    hash.update(side.version.mimeType);
    hash.update("\0");
    hash.update(side.version.data);
  } else if (side.status === "lfs-missing") {
    hash.update(String(side.byteLength));
    hash.update(side.fetchable ? "\0fetchable" : "\0unavailable");
  }
}

function describeFileDiff(diff: GitFileDiff): string {
  if (diff.kind === "text") return diff.text.trim();
  if (diff.kind === "image") return "[Image file changed]";
  if (diff.kind === "binary") return "[Binary file changed]";
  if (diff.kind === "empty") return "[No textual diff available]";
  return `[Diff unavailable: ${diff.text.trim() || "unknown error"}]`;
}

function hasWholeFileMetadata(text: string): boolean {
  return /^(?:new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to) /m.test(text);
}

function hashParts(parts: string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}
