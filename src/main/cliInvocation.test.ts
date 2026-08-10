import { describe, expect, it } from "vite-plus/test";
import { createCliInvocation, resolveWindowsCliExecutable } from "./cliInvocation";

describe("Windows CLI invocation", () => {
  it("resolves a CLI shim from absolute PATH entries outside the repository", () => {
    const repoPath = "D:\\work\\repo";
    const installedShim = "C:\\Users\\Taylor\\AppData\\Roaming\\npm\\codex.cmd";
    const files = new Set([
      "D:\\work\\repo\\codex.cmd",
      installedShim
    ]);
    const env = {
      Path: `.;${repoPath};C:\\Users\\Taylor\\AppData\\Roaming\\npm`,
      PATHEXT: ".CMD;.EXE",
      ComSpec: "C:\\Windows\\System32\\cmd.exe"
    };

    const invocation = createCliInvocation("codex", ["--version"], {
      platform: "win32",
      env,
      workingDirectory: repoPath,
      isFile: (candidate) => files.has(candidate)
    });

    expect(invocation).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", installedShim, "--version"]
    });
  });

  it("fails with an absolute missing path instead of falling back to cwd lookup", () => {
    const repoPath = "D:\\work\\repo";
    const invocation = createCliInvocation("claude", ["-p"], {
      platform: "win32",
      env: {
        PATH: `.;${repoPath}`,
        PATHEXT: ".CMD;.EXE"
      },
      workingDirectory: repoPath,
      isFile: (candidate) => candidate === "D:\\work\\repo\\claude.cmd"
    });

    expect(invocation).toEqual({
      command: "C:\\__githead_cli_not_found__\\claude.exe",
      args: ["-p"]
    });
  });

  it("matches Windows environment names and excluded directories case-insensitively", () => {
    const files = new Set([
      "C:\\repo\\tools\\codex.exe",
      "C:\\Program Files\\Codex\\codex.exe"
    ]);

    expect(resolveWindowsCliExecutable("codex", {
      path: "C:\\repo\\tools;C:\\Program Files\\Codex",
      pathext: ".EXE"
    }, "c:\\REPO", (candidate) => files.has(candidate))).toBe("C:\\Program Files\\Codex\\codex.exe");
  });
});
