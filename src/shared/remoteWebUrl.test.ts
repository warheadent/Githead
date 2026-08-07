import { describe, expect, it } from "vite-plus/test";
import { getRepositoryWebUrl, remoteUrlToWebUrl } from "./remoteWebUrl";

describe("remoteUrlToWebUrl", () => {
  it.each([
    ["https://github.com/openai/codex.git", "https://github.com/openai/codex"],
    ["git@github.com:openai/codex.git", "https://github.com/openai/codex"],
    ["ssh://git@gitlab.example.test/group/project.git", "https://gitlab.example.test/group/project"],
    ["git://code.example.test/team/repo.git", "https://code.example.test/team/repo"]
  ])("converts %s to a browser URL", (remoteUrl, expected) => {
    expect(remoteUrlToWebUrl(remoteUrl)).toBe(expected);
  });

  it("removes credentials and non-repository URL parts", () => {
    expect(remoteUrlToWebUrl("https://user:secret@example.test/team/repo.git/?token=secret#readme"))
      .toBe("https://example.test/team/repo");
  });

  it.each(["", "/work/local-repo", "file:///work/local-repo", "lore://127.0.0.1:41337"])("rejects non-web remote %s", (remoteUrl) => {
    expect(remoteUrlToWebUrl(remoteUrl)).toBeNull();
  });
});

describe("getRepositoryWebUrl", () => {
  it("prefers the origin fetch URL", () => {
    expect(getRepositoryWebUrl([
      { name: "mirror", url: "https://mirror.example.test/team/repo.git", direction: "fetch" },
      { name: "origin", url: "git@github.com:openai/codex.git", direction: "push" },
      { name: "origin", url: "https://github.com/openai/codex.git", direction: "fetch" }
    ])).toBe("https://github.com/openai/codex");
  });
});
