# Contributing

Thanks for taking the time to contribute to Githead.

## Development Setup

Prerequisites:

- Node.js with npm
- Vite+ `vp` CLI
- Git available on your `PATH`
- Windows for packaging and full desktop validation

Install dependencies:

```sh
vp install
```

If `vp` is not installed globally yet, run `npm install` once to bootstrap the local Vite+ CLI.
When using the local CLI, prefix commands with `npm exec --`, for example `npm exec -- vp run dev`.

Run the app in development:

```sh
vp run dev
```

## Verification

Run these checks before opening a pull request:

```sh
vp check
vp run typecheck
vp test
vp run build
```

## Pull Requests

- Keep changes focused and predictable.
- Prefer shared helpers over duplicating logic across files.
- Add or update targeted tests for behavior changes.
- Include user-facing documentation updates when changing setup, release, configuration, security, or data-flow behavior.
