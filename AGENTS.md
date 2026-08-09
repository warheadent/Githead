# Githead Agent Guide

## Priorities

Optimize for performance and reliability. Preserve predictable behavior under load and during session restarts, reconnects, and partial streams. When priorities conflict, choose correctness and robust recovery over short-term convenience.

## Maintainability

- Reuse existing abstractions and module boundaries.
- Before adding functionality, search for existing shared logic. Extend it when it has multiple consumers or a clear reusable responsibility.
- Keep each behavior in one authoritative implementation. Avoid parallel local fixes and speculative abstractions.

## Verification

Use the narrowest relevant checks for the change. For the normal project check, run `vp check`, `vp run typecheck`, and the relevant tests; run `vp run build` when build or packaging behavior is affected.

For renderer-visible changes or visual checks:

1. Run `npm run dev:inspect`.
2. Connect browser automation to the Electron CDP target on port `9222`.
3. Verify that the inspected target exposes `window.githead` before judging renderer behavior.

The Vite URL is not a valid renderer test target because it does not receive the Electron preload API and may appear blank. If Electron verification is unavailable, run the relevant automated checks and report that visual verification was not performed. Verification is complete only when the applicable checks pass and this limitation is reported when it applies.

## Lore

When a task touches Lore commands, repository behavior, configuration, or data models, read the current official Lore documentation and source before designing, implementing, or reviewing the change. Use the source to resolve behavior that the documentation does not define, and report any conflict between them.

- [Lore source](https://github.com/EpicGames/lore)
- [System design](https://epicgames.github.io/lore/explanation/system-design/)
- [QuickStart](https://epicgames.github.io/lore/tutorials/quickstart/)
- [CLI command reference](https://epicgames.github.io/lore/reference/lore-cli-commands/)
- [CLI config reference](https://epicgames.github.io/lore/reference/lore-cli-config/)
