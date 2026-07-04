import { describe, expect, it } from "vite-plus/test";
import { getSupportedGitHubOrigin, parseGitHubRemoteUrl } from "./githubRemote";

describe("githubRemote", () => {
  it.each([
    "https://github.com/openai/codex.git",
    "git@github.com:openai/codex.git",
    "ssh://git@github.com/openai/codex.git"
  ])("parses supported GitHub remote URL %s", (remoteUrl) => {
    expect(parseGitHubRemoteUrl(remoteUrl)).toEqual({
      owner: "openai",
      name: "codex",
      fullName: "openai/codex",
      webUrl: "https://github.com/openai/codex"
    });
  });

  it("ignores non-GitHub remote URLs and nested paths", () => {
    expect(parseGitHubRemoteUrl("https://example.test/openai/codex.git")).toBeNull();
    expect(parseGitHubRemoteUrl("https://github.com/openai/codex/extra.git")).toBeNull();
  });

  it("uses the fetch origin before other remotes", () => {
    expect(getSupportedGitHubOrigin([
      {
        name: "origin",
        url: "git@github.com:openai/codex.git",
        direction: "push"
      },
      {
        name: "upstream",
        url: "https://github.com/other/repo.git",
        direction: "fetch"
      },
      {
        name: "origin",
        url: "https://github.com/openai/githead.git",
        direction: "fetch"
      }
    ])).toEqual({
      owner: "openai",
      name: "githead",
      fullName: "openai/githead",
      webUrl: "https://github.com/openai/githead"
    });
  });
});
