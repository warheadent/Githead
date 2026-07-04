import { spawn } from "node:child_process";
import electronPath from "electron";
import { createServer } from "vite-plus";

const vpCommand = process.platform === "win32" ? "vp.cmd" : "vp";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
      windowsHide: false
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

await run(vpCommand, ["run", "build:main"]);

const server = await createServer({
  configFile: "vite.config.ts",
  server: {
    host: "127.0.0.1"
  }
});

await server.listen();
server.printUrls();

const resolvedUrls = server.resolvedUrls?.local ?? [];
const devServerUrl = resolvedUrls[0] ?? "http://127.0.0.1:5173/";

const electron = spawn(String(electronPath), ["."], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: devServerUrl
  },
  stdio: "inherit",
  windowsHide: false
});

const shutdown = async () => {
  electron.kill();
  await server.close();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

electron.on("close", (code) => {
  void server.close().finally(() => process.exit(code ?? 0));
});
