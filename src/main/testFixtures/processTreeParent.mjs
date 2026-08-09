import { spawn } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const [readyPath, sentinelPath, sentinelDelayText] = process.argv.slice(2);
if (!readyPath || !sentinelPath || !sentinelDelayText) {
  throw new Error("Expected ready path, sentinel path, and sentinel delay arguments.");
}

const descendantFixture = fileURLToPath(new URL("./processTreeDescendant.mjs", import.meta.url));
const descendant = spawn(process.execPath, [
  descendantFixture,
  readyPath,
  sentinelPath,
  sentinelDelayText
], {
  stdio: "ignore",
  windowsHide: true
});

const reportReady = () => {
  if (fs.existsSync(readyPath)) {
    process.stdout.write(`started:${descendant.pid}\n`);
    return;
  }
  setTimeout(reportReady, 5);
};

reportReady();
setInterval(() => {}, 1_000);
