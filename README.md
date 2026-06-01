# Githead

A lightweight Windows desktop GUI for common Git sync commands, built with Electron and React.

Githead operates on **one selected local repository at a time**. It gives you a focused view of your working tree, branch state, and remote sync status — plus read-only GitHub insight (workflow runs, pull requests, issues) when the repository's `origin` points to GitHub.

## Features

- **Repository workspace** — pick a local Git repository and switch quickly between recently opened ones. The active repository's branch, upstream, and remotes are always in view.
- **Sync commands** — run `fetch`, `pull`, and `push` with live streamed output and an activity log.
- **File status & staging** — see staged and unstaged changes, stage/unstage files, and view per-file diffs with syntax highlighting.
- **Committing** — write a commit message and commit staged changes. Optionally **generate a commit message** from the staged diff using an LLM (via [OpenRouter](https://openrouter.ai/)).
- **Commit history** — browse the commit graph, inspect commit details, and view file-level diffs for any commit.
- **Branches** — view branches, switch the current branch, and create new branches.
- **File actions** — open a file, reveal it in Explorer, copy its path, revert changes, delete it, or add it to `.gitignore`.
- **GitHub insight** — when `origin` is a GitHub remote, view recent **Workflow Runs**, open **Pull Requests**, and open **Issues**.
- **Live updates** — the repository is watched on disk, so the UI refreshes automatically when files change.
- **Auto-update** — the packaged app checks GitHub releases and can download and install updates.

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

## Configuration

### AI commit messages

Commit message generation uses the OpenRouter Chat Completions API. Open **Settings** in the app and provide:

- an **OpenRouter API key**
- a **model** (e.g. an OpenRouter model slug)
- optional **site URL** and **site title** (sent as OpenRouter attribution headers)

The API key is stored by the app; the staged diff is sent to OpenRouter to produce a suggested message.

### GitHub access

The Workflow Runs, Pull Requests, and Issues tabs query the public GitHub REST API for the repository behind `origin`. Public repositories work without any setup. For private repositories (or to raise rate limits), authenticate with the GitHub CLI (`gh auth login`) or set a `GITHUB_TOKEN` / `GH_TOKEN` environment variable, then refresh.

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

Useful checks:

```sh
npm run typecheck   # type-check renderer, electron, and test configs
npm test            # run the Vitest suite
```

> **Note:** Do not visually verify the renderer by opening the Vite URL directly in a browser. The UI depends on Electron preload APIs (`window.githead`) and will render a blank page outside the Electron shell. Verify through the Electron app, or rely on `npm test`, `npm run typecheck`, and `npm run build`.

## License

MIT
