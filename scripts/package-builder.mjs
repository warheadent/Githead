import { spawn } from "node:child_process";
import path from "node:path";

export function runElectronBuilder(platformArgs, extraArgs = process.argv.slice(2)) {
  const builderCli = path.join(process.cwd(), "node_modules", "electron-builder", "cli.js");
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
