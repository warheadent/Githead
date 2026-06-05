# Githead

A lightweight Windows desktop GUI, built with Electron and React.

## Why it was built

Our team needed a faster GUI for working with Git on game development projects. Our preferred tooling at the time was [SourceTree](https://www.sourcetreeapp.com/) but it's featureset and performance has fallen behind in recent years. This project is our attempt to make a Git GUI client that focuses in on what we actually need an interface for, and adds in some other tools to reduce constant context switching.

## Features

- **Repository workspace** — pick a local Git repository and switch quickly between recently opened ones. The active repository's branch, upstream, and remotes are always in view.
- **Sync commands** — run `fetch`, `pull`, and `push` with live streamed output and an activity log.
- **File status & staging** — see staged and unstaged changes, stage/unstage files, and view per-file diffs with syntax highlighting.
- **Committing** — write a commit message and commit staged changes. Optionally **generate a commit message** from the staged diff using an LLM (via [OpenRouter](https://openrouter.ai/)).
- **Commit history** — browse the commit graph, inspect commit details, and view file-level diffs for any commit.
- **Branches** — view branches, switch the current branch, and create new branches.
- **GitHub insight** — when `origin` is a GitHub remote, view recent **Workflow Runs**, open **Pull Requests**, and open **Issues**.
- **Live updates** — the repository is watched on disk, so the UI refreshes automatically when files change.

## Tech stack

- [Electron](https://www.electronjs.org/) — desktop shell (main + preload + renderer)
- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) — renderer UI
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) + [lucide-react](https://lucide.dev/) — styling and components
- [Vitest](https://vitest.dev/) + Testing Library — tests
- [electron-builder](https://www.electron.build/) — Windows (NSIS) packaging

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (with npm)
- [Git](https://git-scm.com/) available on your `PATH`

### Install

```sh
npm install
```

### Run in development

```sh
npm run dev
```

This builds the Electron main process, starts the Vite dev server, and launches the Electron shell pointed at it.

### Build

```sh
npm run build
```

### Package a Windows installer

```sh
npm run package:win        # full NSIS installer
npm run package:win:dir    # unpacked directory (faster, for testing)
```

Output is written to the `release/` directory.

### Bump the release version

```sh
npm run version:bump -- patch
npm run version:patch
npm run version:minor
npm run version:major
```

The version helper runs `npm version` without npm's automatic git tag behavior, type-checks the project, commits only `package.json` and `package-lock.json`, and creates a matching `v<version>` tag. It does not push automatically.

## Configuration

### Repository actions

Repositories can expose custom commands in the Sync bar by adding a `.githead` folder at the repository root. Define shared actions in `.githead/actions.toml`:

```toml
[[actions]]
name = "Build"
command = "npm run build"
shell = "powershell" # powershell | cmd | bash
```

Use **Manage Repository Actions** in the Actions menu to create, edit, delete, and reorder shared or local actions from Githead. Optional `.githead/actions.local.toml` entries are loaded after `actions.toml`. Local entries with the same action name replace the shared action; new local entries are appended. Configured actions run from the repository root and use the same workspace trust prompt and Activity Log as built-in Git commands.

### AI commit messages

Commit message generation uses the OpenRouter Chat Completions API. Open **Settings** in the app and provide:

- an **OpenRouter API key**
- a **model** (e.g. an OpenRouter model slug)
- a **commit message prompt** used to guide generated messages

The API key is stored by the app; the configured prompt and staged diff are sent to OpenRouter to produce a suggested message.

### GitHub access

The Workflow Runs, Pull Requests, and Issues tabs query the public GitHub REST API for the repository behind `origin`. Public repositories work without any setup. For private repositories, authenticate with the GitHub CLI (`gh auth login`) or set a `GITHUB_TOKEN` / `GH_TOKEN` environment variable, then refresh.

## Privacy and data flow

- Githead runs Git commands locally against repositories selected by the user.
- Repository paths, branch names, remotes, diffs, commit messages, and command output can contain sensitive information. Review logs before sharing them publicly.
- GitHub insight calls the GitHub REST API for the repository behind `origin`. If the GitHub CLI is authenticated or `GITHUB_TOKEN` / `GH_TOKEN` is set, Githead may use that authentication for private repositories or higher rate limits.
- AI commit message generation is optional. When used, Githead sends the staged diff to OpenRouter and receives a suggested commit message.
- OpenRouter API keys are stored locally by the app and encrypted when the operating system provides encryption support.

## Project layout

```
src/
  main/        Electron main + preload: Git, GitHub, AI, repo-watch, update services,
               IPC handlers, and the preload bridge exposing the typed `window.githead` API
  renderer/    React UI (App, commit graph, diff parser, syntax highlighting)
  shared/      IPC channel names and shared TypeScript types
  components/  Reusable UI components (Radix + Tailwind)
scripts/      dev and packaging scripts
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification, and pull request guidance.

## License

[MIT](LICENSE)
