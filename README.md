# Githead

Githead is a desktop interface for Git and [Lore](https://github.com/EpicGames/lore). It uses Electron, React, and TypeScript.

Githead focuses on the version-control tasks that game development teams use each day. It keeps these tasks in one fast, focused application.

Githead is in early development. Use standard backups and repository safeguards for important work.

## Features

- **Repository workspace:** Open a local repository or clone one from a remote source. Switch between recent repositories from the sidebar.
- **Sync commands:** Run fetch, pull, and push operations. View live command output in the activity log.
- **Status and staging:** View staged, unstaged, and conflicted files. Stage complete files or individual diff hunks.
- **Diffs and previews:** View text and image diffs. Preview GitHub-flavored Markdown, tables, and Mermaid diagrams.
- **Commits:** Create commits, revert commits, reset branches, and manage tags.
- **History:** View the commit graph and commit details. Follow file history through renames and view line attribution.
- **Branches:** Create, switch, rename, publish, and remove local Git branches. Push a branch to a selected remote branch.
- **Worktrees:** Group linked Git worktrees. Create worktrees and remove clean worktrees that are not active.
- **Remotes:** Add, rename, edit, inspect, and remove Git remotes.
- **Submodules:** Inspect submodule states. Open, initialize, update, synchronize, and clone submodules.
- **GitHub:** View and filter workflow runs, pull requests, and issues. Create issues from repository Issue Forms, classic templates, or a blank form. Create and check out pull requests.
- **AI text generation:** Generate commit messages and pull request text from repository changes. Global and repository-specific settings are available.
- **Custom actions:** Add repository commands to the Actions menu. Githead runs them from the repository root.
- **Live updates:** Githead monitors the active repository and updates the interface after file changes.
- **Appearance:** Select the color theme, interface font, code font, zoom level, file layout, and table columns.
- **Lore:** Open or clone Lore repositories. Use supported status, staging, revision, branch, and synchronization operations.

## Known limitations

- Githead has received tests on a limited set of repositories and workflows.
- Line-level staging is not available. Githead supports file-level and hunk-level staging for Git repositories.
- Some layouts can have problems on small windows or with unusually large content.
- Lore support is experimental and does not have full Git feature parity.
- Githead currently tests Lore support with Lore CLI 0.8.x.
- Linux `.deb` packages do not use the in-app updater.

## Download

Download packaged builds from the [Githead releases page](https://github.com/warheadent/Githead/releases).

The Windows package uses an NSIS installer. Linux packages are available as AppImage and `.deb` files for x64 systems.

## Build from source

### Prerequisites

Install these tools:

- [Node.js](https://nodejs.org/) with npm
- The [Vite+](https://viteplus.dev/) `vp` command-line interface
- [Git](https://git-scm.com/) on your `PATH`

The project requires Node.js `^22.18.0` or `>=24.11.0`.

If you use Lore repositories, install the [Lore CLI](https://epicgames.github.io/lore/how-to/install-lore-cli/) on your `PATH`.

### Install dependencies

Run this command:

```sh
vp install
```

If `vp` is not available globally, run this command once:

```sh
npm install
```

Then add `npm exec --` before each Vite+ command:

```sh
npm exec -- vp run build
npm exec -- vp run package:win:dir
```

### Run the development application

Run this command:

```sh
vp run dev
```

This command builds the Electron main process. It also starts the development server and opens the Electron application.

To inspect the Electron renderer on CDP port 9222, run this command:

```sh
vp run dev:inspect
```

### Build the application

Run this command:

```sh
vp run build
```

### Run the project checks

Run these commands before you submit a change:

```sh
vp check
vp run typecheck
vp test
vp run build
```

### Create desktop packages

Use one of these commands:

```sh
vp run package:win        # Create the Windows NSIS installer.
vp run package:win:dir    # Create an unpacked Windows directory.
vp run package:linux      # Create x64 AppImage and .deb packages.
vp run package:linux:dir  # Create an unpacked Linux directory.
```

Githead writes package output to the `release/` directory.

To run an AppImage, make the file executable first:

```sh
chmod +x release/Githead-<version>-x86_64.AppImage
./release/Githead-<version>-x86_64.AppImage
```

If release metadata is available, packaged Windows and AppImage builds can use in-app updates. Install new `.deb` packages manually.

### Change the release version

Use one of these commands:

```sh
vp run version:bump -- patch
vp run version:patch
vp run version:minor
vp run version:major
```

The version script updates `package.json` and `package-lock.json`. Then it runs the type checks and tests.

If the checks pass, the script commits the two package files and creates a matching `v<version>` tag. It does not push them.

## Configuration

### Repository actions

A repository can add custom commands to the Githead Actions menu. Add a `.githead/actions.toml` file at the repository root.

```toml
[[actions]]
name = "Build"
description = "Compile the application and check the production output."
command = "vp run build"
shell = "powershell" # powershell | cmd | bash
```

The `description` field is optional. Githead shows the description in a tooltip.

Use `>` in an action name to place it in a nested menu. Githead trims whitespace around each menu segment and supports deeper paths such as `Release > Windows > Package`.

```toml
[[actions]]
name = "Packaging > Package for Windows"
description = "Build an unpacked Windows application bundle."
command = "npm run package:win:dir"
shell = "powershell"
```

Use **Manage Repository Actions** to create, edit, remove, and reorder actions. You can manage shared actions and local actions.

Githead reads local actions from `.githead/actions.local.toml` after it reads shared actions. A local action replaces a shared action with the same name.

Githead adds new local actions after the shared actions. All configured actions use the repository root as their working directory.

Githead uses the same trust prompt and activity log for custom actions and built-in Git commands.

### AI text generation

Open **Settings**, and then select an AI provider. Enter the model and credentials that the provider requires.

Githead supports these providers and default models:

- **OpenRouter:** `openai/gpt-5.6-luna`
- **OpenAI API:** `gpt-5.4-nano`
- **Codex CLI:** `gpt-5.6-luna`
- **Anthropic API:** `claude-haiku-4-5-20251001`
- **Claude Code:** `haiku`

API providers require an API key. CLI providers use the credentials from the installed command-line tool.

Codex CLI requires a successful `codex login status` command. Claude Code requires a successful `claude auth status` command.

You can save different AI settings for a repository. Githead stores these settings in `.githead/ai-settings.json` in that repository.

Repository settings contain models, prompts, and reasoning levels. They do not contain API keys.

Githead sends the configured prompt and repository changes to the selected provider. The provider returns the suggested text.

### GitHub access

If `origin` points to a GitHub repository, Githead enables GitHub features. Public repositories usually work without authentication.

For private repositories, authenticate with `gh auth login`. You can also set the `GITHUB_TOKEN` or `GH_TOKEN` environment variable.

Githead reads an available GitHub CLI credential once during each application session. It keeps this credential only in main-process memory.

The GitHub lists load one page at a time. The total number can be larger than the items that Githead currently shows.

The History view uses a limited GraphQL request for pull request and check data. If this request fails, local history remains available.

### Remote management

Open **Manage Remotes** from the Remotes row in the repository sidebar.

Githead can edit a standard remote that uses one URL for fetch and push. It identifies remotes with multiple URLs as advanced configurations.

Githead can rename or remove an advanced remote. Use the Git command-line interface to edit its URLs.

This restriction prevents the loss of endpoints. Adding or editing a remote does not start a fetch operation.

## Privacy and data flow

- Githead runs version-control commands on the local computer.
- Repository paths, branches, remotes, diffs, messages, and command output can contain sensitive information.
- Githead sends GitHub requests for the repository that `origin` identifies.
- If you use an AI text-generation command, Githead sends repository changes to the selected provider.
- Githead stores API keys on the local computer. If the operating system supports encryption, Githead encrypts the keys.
- Codex CLI and Claude Code manage their own local authentication.

Review the activity log before you share it.

## Technology

- [Electron](https://www.electronjs.org/) provides the desktop shell, preload bridge, and main process.
- [React 19](https://react.dev/) provides the user interface.
- [Vite+](https://viteplus.dev/) provides the frontend tools and test runner.
- [TypeScript](https://www.typescriptlang.org/) provides static types.
- [Tailwind CSS](https://tailwindcss.com/) and [Radix UI](https://www.radix-ui.com/) provide styles and interface components.
- [electron-builder](https://www.electron.build/) creates the desktop packages.

## Project layout

```text
src/
  main/        Electron main process, preload bridge, and local services
  renderer/    React application and interface logic
  shared/      Shared TypeScript types and IPC channel names
  components/  Reusable interface components
scripts/       Development, release, and packaging scripts
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, checks, and pull request instructions.

## License

Githead uses the [MIT License](LICENSE).
