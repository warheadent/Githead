import fs from "node:fs";

const [readyPath, sentinelPath, sentinelDelayText] = process.argv.slice(2);
if (!readyPath || !sentinelPath || !sentinelDelayText) {
  throw new Error("Expected ready path, sentinel path, and sentinel delay arguments.");
}

const sentinelDelayMs = Number.parseInt(sentinelDelayText, 10);
process.on("SIGTERM", () => {});
fs.writeFileSync(readyPath, "ready");
setTimeout(() => fs.writeFileSync(sentinelPath, "survived"), sentinelDelayMs);
setInterval(() => {}, 1_000);
