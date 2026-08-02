import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { FLEX_SERVICE_TIER, generateReleaseSummary } from "./releaseSummaryClient.mjs";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const DEFAULT_MODEL = "openai/gpt-5.6-luna";
const MAX_COMMITS_CHARS = 40_000;
const MAX_STAT_CHARS = 20_000;
const MAX_DIFF_CHARS = 120_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || process.env.RELEASE_SUMMARY_DRY_RUN === "1";
const tagArgIndex = args.indexOf("--tag");
const explicitTag = tagArgIndex >= 0 ? args[tagArgIndex + 1] : undefined;

if (tagArgIndex >= 0 && !explicitTag) {
  fail("Usage: node scripts/summarize-release.mjs [--dry-run] [--tag vX.Y.Z]");
}

const currentTag = explicitTag ?? process.env.GITHUB_REF_NAME ?? getExactHeadTag();

if (!isSemverTag(currentTag)) {
  fail(`Current ref "${currentTag}" is not a semver release tag like v1.2.3.`);
}

const tags = getSemverTags();
const currentTagIndex = tags.indexOf(currentTag);

if (currentTagIndex === -1) {
  fail(`Current tag "${currentTag}" was not found. Ensure actions/checkout uses fetch-depth: 0.`);
}

const previousTag = tags[currentTagIndex + 1] ?? null;
const diffBase = previousTag ?? EMPTY_TREE;
const rangeLabel = previousTag ? `${previousTag}..${currentTag}` : `repository start..${currentTag}`;
const comparisonNote = previousTag
  ? `Compared against previous release tag ${previousTag}.`
  : "No previous semver release tag was found, so this summary compares the release against the repository start.";

const commits = trimOutput(
  runGit(["log", "--no-merges", "--pretty=format:%h %s", currentTag, ...(previousTag ? [`^${previousTag}`] : [])]),
  MAX_COMMITS_CHARS
);
const changedFiles = trimOutput(runGit(["diff", "--name-status", "--find-renames", diffBase, currentTag]), MAX_STAT_CHARS);
const diffStat = trimOutput(runGit(["diff", "--stat", "--find-renames", diffBase, currentTag]), MAX_STAT_CHARS);
const diff = trimOutput(runGit(["diff", "--find-renames", "--unified=3", diffBase, currentTag]), MAX_DIFF_CHARS);

const payload = {
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
  temperature: 0.2,
  max_tokens: 900,
  messages: [
    {
      role: "system",
      content:
        "You write concise, user-facing GitHub release notes for a Windows desktop app. Focus on meaningful behavior changes, reliability, fixes, and user impact. Do not invent changes. Avoid raw commit hashes unless needed."
    },
    {
      role: "user",
      content: [
        `Release: ${currentTag}`,
        comparisonNote,
        "",
        "Write markdown release notes with these sections when supported by the evidence:",
        "- Highlights",
        "- Fixes",
        "- Internal changes",
        "",
        "Keep the notes concise. If a section has no clear evidence, omit it.",
        "",
        `Commit range: ${rangeLabel}`,
        "",
        "Commits:",
        fenced(commits || "(no commits found)"),
        "",
        "Changed files:",
        fenced(changedFiles || "(no changed files found)"),
        "",
        "Diff stat:",
        fenced(diffStat || "(no diff stat found)"),
        "",
        "Bounded diff:",
        fenced(diff || "(no diff found)")
      ].join("\n")
    }
  ]
};

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        currentTag,
        previousTag,
        rangeLabel,
        model: payload.model,
        promptChars: payload.messages.reduce((total, message) => total + message.content.length, 0),
        commitsChars: commits.length,
        changedFilesChars: changedFiles.length,
        diffStatChars: diffStat.length,
        diffChars: diff.length,
        payload: {
          ...payload,
          service_tier: FLEX_SERVICE_TIER
        }
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!process.env.OPENROUTER_API_KEY) {
  fail("OPENROUTER_API_KEY is required to generate release notes.");
}

let summary;

try {
  summary = await generateReleaseSummary({
    apiKey: process.env.OPENROUTER_API_KEY,
    payload,
    referer: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY ?? ""}`
      : "https://github.com",
    title: "Githead Release Summary"
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

writeGithubOutput("body", summary.body);
console.log(`Generated release summary for ${rangeLabel} with ${payload.model} on ${summary.serviceTier ?? "an unreported"} service tier.`);

function getExactHeadTag() {
  return runGit(["describe", "--tags", "--exact-match", "HEAD"], { allowFailure: true }).trim();
}

function getSemverTags() {
  return runGit(["tag", "--list", "v*.*.*", "--sort=-v:refname"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(isSemverTag);
}

function isSemverTag(tag) {
  return /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(tag ?? "");
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 25 * 1024 * 1024
    }).trimEnd();
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }

    const stderr = error.stderr?.toString()?.trim();
    fail(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : "."}`);
  }
}

function trimOutput(value, maxChars) {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}\n\n[truncated to ${maxChars} characters]`;
}

function fenced(value) {
  return ["```", value, "```"].join("\n");
}

function writeGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    console.log(value);
    return;
  }

  const delimiter = `EOF_${randomUUID().replaceAll("-", "_")}`;
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
