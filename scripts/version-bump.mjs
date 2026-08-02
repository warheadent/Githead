import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const allowedBumpTypes = new Set(["patch", "minor", "major"]);
const [bumpType = "patch", ...extraArgs] = process.argv.slice(2);

if (extraArgs.length > 0 || !allowedBumpTypes.has(bumpType)) {
  console.error("Usage: node scripts/version-bump.mjs [patch|minor|major]");
  process.exit(1);
}

run("git", ["diff", "--quiet", "--", "package.json", "package-lock.json"], {
  failureMessage:
    "package.json or package-lock.json already has unstaged changes. Commit or discard those changes before bumping the version."
});
run("git", ["diff", "--cached", "--quiet", "--", "package.json", "package-lock.json"], {
  failureMessage:
    "package.json or package-lock.json already has staged changes. Commit or unstage those changes before bumping the version."
});

run("npm", ["version", bumpType, "--no-git-tag-version"]);
run("vp", ["run", "typecheck"]);
run("npm", ["test"]);
run("git", ["add", "package.json", "package-lock.json"]);

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;

if (typeof version !== "string" || version.length === 0) {
  console.error("package.json does not contain a valid version string.");
  process.exit(1);
}

run("git", ["commit", "-m", `chore: bump version to ${version}`]);
run("git", ["tag", `v${version}`]);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    shell:
      process.platform === "win32" && (command === "vp" || command === "npm"),
    stdio: "inherit"
  });

  if (result.status === 0) {
    return;
  }

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
  }

  if (options.failureMessage) {
    console.error(options.failureMessage);
  }

  process.exit(result.status ?? 1);
}
