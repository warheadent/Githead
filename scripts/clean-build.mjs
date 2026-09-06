import { rm } from "node:fs/promises";

// Cache restoration overlays files; clear the owned output first so old hashed
// chunks and debug maps cannot survive a switch between cached builds.
const outputDirectories = {
  main: new URL("../dist/main/main/", import.meta.url),
  renderer: new URL("../dist/renderer/", import.meta.url)
};
const target = process.argv[2];
if (!Object.hasOwn(outputDirectories, target)) {
  throw new Error("Expected build target: main or renderer");
}
await rm(outputDirectories[target], { recursive: true, force: true });
