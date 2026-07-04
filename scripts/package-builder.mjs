import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function runElectronBuilder(platformArgs, extraArgs = process.argv.slice(2)) {
  // Resolve electron-builder through Node's module resolution instead of a fixed
  // `process.cwd()/node_modules` path so packaging works from a git worktree,
  // where the local node_modules is empty and dependencies resolve by walking up
  // to a parent checkout's node_modules.
  let builderCli;
  try {
    builderCli = require.resolve("electron-builder/cli.js");
  } catch {
    console.error("Unable to resolve electron-builder. Run `vp install` (it is a devDependency).");
    process.exit(1);
    return;
  }

  const child = spawn(process.execPath, [builderCli, ...platformArgs, ...extraArgs], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false"
    },
    stdio: "inherit",
    windowsHide: false
  });

  child.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on("close", (code) => {
    process.exit(code ?? 1);
  });
}
