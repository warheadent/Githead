const MAX_TOTAL_PATCH_CHARS = 100_000;
const MAX_COMMIT_PATCH_CHARS = 20_000;

export function collectReleaseEvidence({ currentTag, previousTag, runGit }) {
  const revisionArgs = [currentTag, ...(previousTag ? [`^${previousTag}`] : [])];
  const hashes = runGit(["rev-list", "--reverse", "--no-merges", ...revisionArgs])
    .split(/\r?\n/)
    .map((hash) => hash.trim())
    .filter(Boolean);
  const patchLimit = Math.min(
    MAX_COMMIT_PATCH_CHARS,
    Math.floor(MAX_TOTAL_PATCH_CHARS / Math.max(hashes.length, 1))
  );

  return hashes.map((hash) => {
    const metadata = runGit(["show", "-s", "--format=%h%x1f%s%x1f%b", hash]);
    const [shortHash, subject, ...bodyParts] = metadata.split("\x1f");
    const fullPatch = runGit([
      "show",
      "--format=",
      "--find-renames",
      "--unified=2",
      hash,
      "--",
      ".",
      ":(exclude)package-lock.json",
      ":(exclude)npm-shrinkwrap.json",
      ":(exclude,glob)**/*.lock",
      ":(exclude,glob)release/**"
    ]);

    return {
      hash,
      shortHash,
      subject,
      body: bodyParts.join("\x1f").trim(),
      changedFiles: runGit(["diff-tree", "--root", "--no-commit-id", "--name-status", "-r", "-M", hash]),
      ...trimPatch(fullPatch, patchLimit)
    };
  });
}

export function getEvidenceStats(evidence) {
  return {
    commitCount: evidence.length,
    evidenceChars: evidence.reduce(
      (total, commit) => total + commit.subject.length + commit.body.length + commit.changedFiles.length + commit.patch.length,
      0
    ),
    truncatedCommitCount: evidence.filter((commit) => commit.patchTruncated).length
  };
}

export function trimPatch(patch, maxChars) {
  if (patch.length <= maxChars) {
    return { patch, patchTruncated: false };
  }

  const filePatches = patch.split(/(?=^diff --git )/m).filter(Boolean);
  const selected = [];
  let selectedLength = 0;

  for (const filePatch of filePatches) {
    const remainingChars = maxChars - selectedLength;

    if (filePatch.length <= remainingChars) {
      selected.push(filePatch);
      selectedLength += filePatch.length;
      continue;
    }

    if (remainingChars > 0) {
      const lineBoundary = filePatch.lastIndexOf("\n", remainingChars);
      const end = lineBoundary > 0 ? lineBoundary : remainingChars;
      selected.push(filePatch.slice(0, end));
    }

    break;
  }

  return {
    patch: `${selected.join("").trimEnd()}\n\n[patch limited to ${maxChars} characters for this commit]`,
    patchTruncated: true
  };
}
