import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Tests that run real Git must not read or write the developer's global Git
// configuration. A global core.hooksPath would send test hooks into the user's
// real hooks directory, and global signing settings make test commits fail.
// Services under test inherit process.env, so this also covers their Git runs.
// Tests that need their own global config can still override it with vi.stubEnv.
// One file per worker process, written once, so no worker rewrites a file that
// another worker's Git process is reading.
const globalConfigPath = path.join(os.tmpdir(), `githead-test-gitconfig-${process.pid}`);
if (!fs.existsSync(globalConfigPath)) {
  fs.writeFileSync(globalConfigPath, "[commit]\n\tgpgSign = false\n[tag]\n\tgpgSign = false\n");
}
process.env.GIT_CONFIG_GLOBAL = globalConfigPath;

// Command-line config from the environment outranks every config file.
for (const name of ["GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS", "GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"]) {
  delete process.env[name];
}
