import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { FLEX_SERVICE_TIER, generateReleaseSummary } from "./releaseSummaryClient.mjs";
import { collectReleaseEvidence, getEvidenceStats } from "./releaseEvidence.mjs";
import {
  buildReleaseSummaryPayload,
  buildRepairPayload,
  createFallbackReleaseNotes,
  parseAndValidateReleaseNotes,
  renderReleaseNotes
} from "./releaseNotes.mjs";

const DEFAULT_MODEL = "openai/gpt-5.6-luna";

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
const rangeLabel = previousTag ? `${previousTag}..${currentTag}` : `repository start..${currentTag}`;
const evidence = collectReleaseEvidence({ currentTag, previousTag, runGit });
const evidenceStats = getEvidenceStats(evidence);
const payload = buildReleaseSummaryPayload({
  model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
  currentTag,
  previousTag,
  evidence
});

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        currentTag,
        previousTag,
        rangeLabel,
        model: payload.model,
        promptChars: payload.messages.reduce((total, message) => total + message.content.length, 0),
        ...evidenceStats,
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
let body;

try {
  summary = await generateReleaseSummary({
    apiKey: process.env.OPENROUTER_API_KEY,
    payload,
    referer: process.env.GITHUB_SERVER_URL
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY ?? ""}`
      : "https://github.com",
    title: "Githead Release Summary"
  });

  let result = parseAndValidateReleaseNotes(summary.body, evidence.map((commit) => commit.shortHash));

  if (result.errors.length > 0) {
    console.log(`::warning::The first release-note response failed content validation: ${result.errors.join(" ")}`);
    const repairPayload = buildRepairPayload(payload, summary.body, result.errors);
    summary = await generateReleaseSummary({
      apiKey: process.env.OPENROUTER_API_KEY,
      payload: repairPayload,
      referer: process.env.GITHUB_SERVER_URL
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY ?? ""}`
        : "https://github.com",
      title: "Githead Release Summary Repair"
    });
    result = parseAndValidateReleaseNotes(summary.body, evidence.map((commit) => commit.shortHash));
  }

  if (result.errors.length > 0) {
    console.log(`::warning::The repaired release-note response failed content validation: ${result.errors.join(" ")}`);
    console.log("::warning::Using the conventional-commit fallback for release notes.");
    body = createFallbackReleaseNotes(evidence);
  } else {
    body = renderReleaseNotes(result.document) || createFallbackReleaseNotes(evidence);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

writeGithubOutput("body", body);
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
