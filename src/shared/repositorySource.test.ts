import { describe, expect, it } from "vite-plus/test";
import { isLoreSource, parseRepositorySource, resolveRepositorySourceBranch } from "./repositorySource";

describe("parseRepositorySource", () => {
  it.each([
    ["openai/repo", "https://github.com/openai/repo.git", "git", "repo"],
    [" https://github.com/openai/repo.git ", "https://github.com/openai/repo.git", "git", "repo"],
    ["git@github.com:openai/repo.git", "git@github.com:openai/repo.git", "git", "repo"],
    ["ssh://git@github.com/openai/repo.git", "ssh://git@github.com/openai/repo.git", "git", "repo"],
    ["git@gitlab.example:team/repo.git", "git@gitlab.example:team/repo.git", "git", "repo"],
    ["https://gitlab.example/group/team/repo.git", "https://gitlab.example/group/team/repo.git", "git", "repo"],
    ["ssh://user@git.example:2222/repo.git", "ssh://user@git.example:2222/repo.git", "git", "repo"],
    ["lore://studio.example:41337/game", "lore://studio.example:41337/game", "lore", "game"],
    ["D:\\Code\\My Repo", "D:\\Code\\My Repo", "local", "My Repo"],
    ['"D:\\Code\\repo"', "D:\\Code\\repo", "local", "repo"],
    ["\\\\server\\share\\repo", "\\\\server\\share\\repo", "local", "repo"],
    ["/home/dev/repo", "/home/dev/repo", "local", "repo"],
    ["~/Code/repo", "~/Code/repo", "local", "repo"],
    ["./repo", "./repo", "local", "repo"],
    ["../repo", "../repo", "local", "repo"],
    ["file:///D:/Code/My%20Repo", "D:/Code/My Repo", "local", "My Repo"],
    ["file://server/share/repo", "//server/share/repo", "local", "repo"]
  ])("parses %s", (input, source, kind, name) => {
    expect(parseRepositorySource(input)).toMatchObject({ source, kind, name });
  });

  it.each([
    ["https://github.com/org/repo/tree/develop", "develop", "develop"],
    ["https://github.com/org/repo/blob/main/src/app.ts#L20", "main", "main/src/app.ts"],
    ["https://github.com/org/repo/tree/feature%2Fwork", "feature/work", "feature/work"],
    ["https://github.com/org/repo/tree/feature/work/src", "feature", "feature/work/src"],
    ["https://github.com/org/repo/pull/23/files", "", ""],
    ["https://github.com/org/repo/issues/42?x=1", "", ""]
  ])("extracts GitHub web link %s", (input, branchName, refPath) => {
    expect(parseRepositorySource(input)).toMatchObject({ source: "https://github.com/org/repo.git", label: "org/repo", branchName, refPath });
  });

  it.each(["", "hello world", "private note", "sk_secret", "https://github.com", "https://github.com/user", "javascript:alert(1)", "https://user:password@example.com/repo", "https://token@github.com/org/repo", "lore://", "lore://server", "org/repo\nsecret", "https://host/%00repo"]) (
    "does not offer unrecognized or credential-bearing clipboard text %s", (input) => expect(parseRepositorySource(input)).toBeNull()
  );

  it("resolves the longest advertised branch in ambiguous GitHub tree and file links", () => {
    expect(resolveRepositorySourceBranch("feature/work/src/app.ts", ["main", "feature", "feature/work"], "feature")).toBe("feature/work");
    expect(resolveRepositorySourceBranch("missing/path", ["main"], "missing")).toBe("missing");
    expect(isLoreSource(" LORE://server/repo")).toBe(true);
  });

  it("does not suggest ordinary clipboard web links, while allowing manually entered remotes without .git", () => {
    expect(parseRepositorySource("https://example.com/articles/a-story", { fromClipboard: true })).toBeNull();
    expect(parseRepositorySource("https://example.com/team/repo.git", { fromClipboard: true })?.kind).toBe("git");
    expect(parseRepositorySource("https://gitlab.com/team/repo", { fromClipboard: true })?.kind).toBe("git");
    expect(parseRepositorySource("https://example.com/team/repo")?.kind).toBe("git");
    expect(parseRepositorySource("https://github.com/settings/profile", { fromClipboard: true })).toBeNull();
    expect(parseRepositorySource("https://github.com/orgs/example/repositories", { fromClipboard: true })).toBeNull();
  });
});
