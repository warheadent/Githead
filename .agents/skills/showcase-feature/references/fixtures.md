# Showcase fixture recipes

Read only the recipe needed for the demonstration. Name temporary repositories `githead-showcase-<feature>-<unique-id>` and create them in the operating system's temporary directory. Make fixture creation cheap enough to use `create → rehearse → recreate → record`.

## Modified or staged files

Create an initial commit, then add only the tracked modifications and untracked files the UI must show. For hunk staging, place independent changes in one file and establish the intended staged/unstaged mix before opening Githead.

The fixture is ready when each visible file and hunk directly supports the demonstration and recreation produces the same state.

## Branch operations

Create a baseline branch plus deterministically named temporary branches. Add only the commits required to make their relationship visually clear.

The fixture is ready when branch names, tips, and ancestry are unambiguous in Githead and reproducible from scratch.

## Ahead and behind state or remotes

Create a local bare repository as the remote, then clone or connect the disposable working repository and make the required local and remote commits. Use a hosted provider only when provider behavior is the feature.

The fixture is ready when the required ahead/behind relationship is deterministic without a network dependency.

## Merge conflicts

Commit a baseline, create two branches, change the same lines differently, commit both versions, and merge them to produce the conflict. Create this conflict in the disposable fixture rather than borrowing an existing conflicted repository.

The fixture is ready when recreation always conflicts in the intended file and lines.

## GitHub-specific behavior

Use only a repository reserved for test activity. Scope issues, pull requests, tags, releases, and workflow runs to the exact demonstration, and clean them up when safe. Keep unrelated production repositories outside the workflow.

The fixture is ready when required provider data exists, contains no private information, and all intended external mutations are authorized.

## Lore behavior

Follow the Lore requirements in `AGENTS.md`: read the current official documentation and source before constructing the fixture. Use a disposable Lore repository and create state with current Lore behavior rather than assuming Git commands are equivalent.

The fixture is ready when current Lore behavior has been verified and the state is deterministic. If safe deterministic state cannot be produced, report the limitation and end the showcase workflow.
