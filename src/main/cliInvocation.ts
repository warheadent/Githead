export interface CliInvocation {
  command: string;
  args: string[];
}

export function createCliInvocation(command: "codex" | "claude", args: string[]): CliInvocation {
  if (process.platform !== "win32") {
    return {
      command,
      args
    };
  }

  return {
    command: "cmd.exe",
    args: [
      "/d",
      "/s",
      "/c",
      command,
      ...args
    ]
  };
}
