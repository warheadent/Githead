import fs from "node:fs";
import path from "node:path";
import { createCliProcessEnv } from "./cliEnvironment";

export interface CliInvocation {
  command: string;
  args: string[];
}

interface CliInvocationOptions {
  env?: NodeJS.ProcessEnv;
  workingDirectory?: string;
  platform?: NodeJS.Platform;
  isFile?: (filePath: string) => boolean;
}

const WINDOWS_EXECUTABLE_EXTENSIONS = [".com", ".exe", ".bat", ".cmd"];

export function createCliInvocation(
  command: "codex" | "claude",
  args: string[],
  options: CliInvocationOptions = {}
): CliInvocation {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    return {
      command,
      args
    };
  }

  const env = options.env ?? createCliProcessEnv();
  const executable = resolveWindowsCliExecutable(
    command,
    env,
    options.workingDirectory,
    options.isFile ?? isFile
  ) ?? missingWindowsCliExecutable(command);
  const extension = path.win32.extname(executable).toLowerCase();

  if (extension !== ".bat" && extension !== ".cmd") {
    return {
      command: executable,
      args
    };
  }

  return {
    command: resolveWindowsCommandInterpreter(env),
    args: [
      "/d",
      "/s",
      "/c",
      executable,
      ...args
    ]
  };
}

export function resolveWindowsCliExecutable(
  command: "codex" | "claude",
  env: NodeJS.ProcessEnv,
  excludedDirectory?: string,
  fileExists: (filePath: string) => boolean = isFile
): string | null {
  const pathValue = getWindowsEnvValue(env, "PATH");
  const extensions = getWindowsExecutableExtensions(env);

  for (const rawEntry of pathValue.split(";")) {
    const entry = rawEntry.trim().replace(/^"|"$/g, "");
    // Empty and relative PATH entries resolve against cwd on Windows. Ignore
    // them so a repository working directory can never participate in lookup.
    if (!entry || !path.win32.isAbsolute(entry)) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = path.win32.normalize(path.win32.join(entry, `${command}${extension}`));
      if (excludedDirectory && isWithinWindowsDirectory(candidate, excludedDirectory)) {
        continue;
      }
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getWindowsExecutableExtensions(env: NodeJS.ProcessEnv): string[] {
  const configured = getWindowsEnvValue(env, "PATHEXT")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter((extension) => /^\.[a-z0-9]+$/.test(extension));
  return configured.length > 0 ? configured : WINDOWS_EXECUTABLE_EXTENSIONS;
}

function getWindowsEnvValue(env: NodeJS.ProcessEnv, name: string): string {
  const matchingKey = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
  return matchingKey ? env[matchingKey] ?? "" : "";
}

function isWithinWindowsDirectory(filePath: string, directory: string): boolean {
  const relative = path.win32.relative(path.win32.resolve(directory), path.win32.resolve(filePath));
  return relative === "" || (!relative.startsWith("..\\") && relative !== ".." && !path.win32.isAbsolute(relative));
}

function resolveWindowsCommandInterpreter(env: NodeJS.ProcessEnv): string {
  const configured = getWindowsEnvValue(env, "COMSPEC");
  if (configured && path.win32.isAbsolute(configured)) {
    return path.win32.normalize(configured);
  }

  const systemRoot = getWindowsEnvValue(env, "SYSTEMROOT");
  const root = systemRoot && path.win32.isAbsolute(systemRoot) ? systemRoot : "C:\\Windows";
  return path.win32.join(root, "System32", "cmd.exe");
}

function missingWindowsCliExecutable(command: "codex" | "claude"): string {
  return path.win32.join("C:\\", "__githead_cli_not_found__", `${command}.exe`);
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
