## Core Priorities

1. Performance first.

2. Reliability first.

3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

## Verification

Do not use standalone Vite/browser visual verification for the renderer. The app depends on Electron preload APIs, so opening `http://127.0.0.1:5173/` or similar directly in a browser can render a blank page and misleading errors such as missing `window.githead` handlers. For visual checks, verify through the Electron shell. If Electron visual verification is not available, rely on targeted automated tests, `npm run typecheck`, and `npm run build`, and clearly state that visual verification was not performed.

## Lore

Lore is a new open source version control system from Epic Games. Whenever working with Lore features in this project, always reference the current version of the documentation and source rather than making assumptions.

### Official Lore Links

- Source: https://github.com/EpicGames/lore
- System Design: https://epicgames.github.io/lore/explanation/system-design/
- QuickStart: https://epicgames.github.io/lore/tutorials/quickstart/
- CLI Command Reference: https://epicgames.github.io/lore/reference/lore-cli-commands/
- CLI Config Reference: https://epicgames.github.io/lore/reference/lore-cli-config/