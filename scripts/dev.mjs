import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import electronPath from "electron";
import { createServer } from "vite-plus";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const vpEntrypoint = path.resolve(scriptDirectory, "..", "node_modules", "vite-plus", "bin", "vp");
const remoteDebuggingArgument = process.argv.find((argument) => argument.startsWith("--remote-debugging-port="));
const remoteDebuggingPort = remoteDebuggingArgument?.slice("--remote-debugging-port=".length).trim();

if (remoteDebuggingArgument && !/^\d+$/.test(remoteDebuggingPort ?? "")) {
  throw new Error("--remote-debugging-port must be a numeric port.");
}

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

await run(process.execPath, [vpEntrypoint, "run", "build:main"]);

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
    VITE_DEV_SERVER_URL: devServerUrl,
    ...(remoteDebuggingPort ? { GITHEAD_REMOTE_DEBUGGING_PORT: remoteDebuggingPort } : {})
  },
  stdio: "inherit",
  windowsHide: false
});

if (remoteDebuggingPort) {
  console.log(`Electron remote debugging is available on http://127.0.0.1:${remoteDebuggingPort}`);
}

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
