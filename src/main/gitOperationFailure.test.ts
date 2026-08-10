import { describe, expect, it } from "vite-plus/test";
import { classifyGitOperationError } from "./gitOperationFailure";

describe("classifyGitOperationError", () => {
  it.each([
    ["Author identity unknown. Run git config user.email.", "missing-author-identity"],
    ["fatal: a branch named 'feature' already exists", "branch-name-conflict"],
    ["fatal: Authentication failed", "authentication"],
    ["Permission denied (publickey)", "authorization"],
    ["CONFLICT (content): merge conflict", "conflict"],
    ["fatal: unable to access remote: Could not resolve host", "network"],
    ["fatal: not a git repository", "not-found"],
    ["Command timed out after 60000ms", "timeout"],
    ["usage: git switch [options]", "validation"],
    ["fatal: an unusual command failure", "process-failure"]
  ] as const)("classifies %s", (message, expected) => {
    expect(classifyGitOperationError(message)).toBe(expected);
  });
});
