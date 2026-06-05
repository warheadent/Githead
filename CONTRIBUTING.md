# Contributing

Thanks for taking the time to contribute to Githead.

## Development Setup

Prerequisites:

- Node.js with npm
- Git available on your `PATH`
- Windows for packaging and full desktop validation

Install dependencies:

```sh
npm install
```

Run the app in development:

```sh
npm run dev
```

## Verification

Run these checks before opening a pull request:

```sh
npm run typecheck
npm test
npm run build
```

## Pull Requests

- Keep changes focused and predictable.
- Prefer shared helpers over duplicating logic across files.
- Add or update targeted tests for behavior changes.
- Include user-facing documentation updates when changing setup, release, configuration, security, or data-flow behavior.
