import path from "node:path";

export function createCliProcessEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return baseEnv;
  }

  const pathKey = getPathKey(baseEnv);
  const mergedPath = mergePathEntries([
    baseEnv[pathKey] ?? "",
    ...knownWindowsCliDirs(baseEnv)
  ]);

  return {
    ...baseEnv,
    [pathKey]: mergedPath
  };
}

function getPathKey(env: NodeJS.ProcessEnv): "PATH" | "Path" {
  return env.Path !== undefined && env.PATH === undefined ? "Path" : "PATH";
}

function knownWindowsCliDirs(env: NodeJS.ProcessEnv): string[] {
  return [
    env.APPDATA ? path.join(env.APPDATA, "npm") : "",
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Programs", "nodejs") : "",
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "Volta", "bin") : "",
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, "pnpm") : "",
    env.USERPROFILE ? path.join(env.USERPROFILE, ".bun", "bin") : "",
    env.USERPROFILE ? path.join(env.USERPROFILE, "scoop", "shims") : ""
  ].filter((entry) => entry.length > 0);
}

function mergePathEntries(values: string[]): string {
  const entries: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    for (const entry of value.split(";")) {
      const trimmed = entry.trim();
      if (!trimmed) {
        continue;
      }

      const key = trimmed.replace(/^"+|"+$/g, "").toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      entries.push(trimmed);
    }
  }

  return entries.join(";");
}
