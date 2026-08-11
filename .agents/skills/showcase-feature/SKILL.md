---
name: showcase-feature
description: Create and validate a concise, silent screen recording of a completed, verified user-visible Githead change. Use after implementation for visible or interactive behavior when a recording of the real Electron renderer would help reviewers understand the result.
---

# Showcase Feature

Produce review evidence, not a promotional video. Capture one clean workflow in the real Githead Electron renderer with controlled, non-sensitive state. A showcase supplements normal verification.

## 1. Gate the showcase

1. Review the requested change and its implementation.
2. Identify the single user-visible behavior the recording will prove.
3. Run the narrowest applicable verification required by `AGENTS.md`.
4. Continue only when that verification passes and the workflow can use disposable or otherwise controlled state without exposing credentials, private repositories, personal data, or other sensitive information.

Finish this step when the verified behavior, safe state, and reason a video helps review are explicit. End the workflow with a limitation report when the change has no meaningful UI behavior, verification fails, or safe capture is not possible.

## 2. Design a tight demonstration

Define internally:

- the initial repository state and Githead screen;
- the user action;
- the expected visible result;
- the reset method.

Use one primary workflow: show the initial state, perform the action, show the result, and hold the result for 1–2 seconds. Target 15–45 seconds and stay below 90 seconds unless the workflow requires more.

When the workflow needs Git, GitHub, or Lore state, read [fixture recipes](references/fixtures.md) and create only the relevant fixture. Keep showcase-specific Git state out of the Githead source repository and other important repositories.

Finish this step when the interaction sequence is minimal and the initial state can be recreated deterministically.

## 3. Start and verify Githead

Start the development application:

```sh
npm run dev:inspect
```

Wait for startup, then connect browser automation to the existing Electron session:

```sh
agent-browser connect 9222
agent-browser tab
agent-browser eval "typeof window.githead"
```

Select the Githead renderer target when several targets exist. Proceed only when `typeof window.githead` is not `undefined`. If verification fails, inspect the targets and startup process again. Treat an uncontrollable Electron renderer as a recording limitation; the standalone Vite page is not a showcase target.

Finish this step when browser automation controls the renderer that exposes `window.githead`.

## 4. Prepare and rehearse

Open the fixture in Githead and prepare unrelated setup before the recorded portion. Present a clean starting screen with unrelated panels and Activity Log noise removed where practical, and with only disposable names and paths visible.

Inspect the current renderer:

```sh
agent-browser snapshot -i
```

Use snapshot accessibility references, semantic locators, stable labels, or test IDs. Refresh the snapshot after material UI changes. Perform the workflow through the same UI interactions a user would use; reserve `eval` for inspection rather than triggering the feature.

Rehearse the entire sequence once. Wait for meaningful visible transitions, confirm the final state, and inspect diagnostics when relevant:

```sh
agent-browser console
agent-browser errors
```

Finish this step only after one rehearsal reaches the expected final state without a product defect or unexpected renderer error. Investigate the implementation instead of recording around a defect.

## 5. Reset to the opening state

Deterministically restore the fixture after rehearsal. Prefer deleting and recreating a cheap disposable repository over undoing many UI operations. Return Githead to the intended screen and confirm the visible initial state.

Finish this step when recording can begin with no additional setup.

## 6. Record one clean take

Create an artifact directory outside normal source files when needed, then use a descriptive filename:

```sh
agent-browser record start ./artifacts/showcase-<feature>.webm
```

Perform only the rehearsed sequence at deliberate pacing. Capture the Githead renderer without terminals, developer tools, unrelated windows, retries, exploration, long idle periods, narration, music, title cards, effects, or annotations. Leave the successful result visible for 1–2 seconds, then stop:

```sh
agent-browser record stop
```

After a flawed take, restore the fixture before recording again. Use `agent-browser record restart` only when the fixture still has the exact initial state.

Finish this step when one take contains the complete successful workflow and no failed interactions.

## 7. Validate, clean up, and report

Inspect the completed artifact. Confirm all of the following:

- It begins at a useful initial state and clearly demonstrates the intended feature.
- The interaction is understandable without narration and no important transition is missed.
- The final state remains visible long enough to inspect.
- Only the real application behavior appears; no failed clicks, unrelated surfaces, credentials, or sensitive information are visible.
- The duration is proportionate to the workflow.

Replace any take that fails a check. Then close the fixture when appropriate, delete temporary repositories and local bare remotes created solely for the showcase, and retain the video outside version control unless the user explicitly requests a commit. Persistent user repositories remain unchanged.

Report the artifact path, the demonstrated behavior, approximate duration when available, and any important limitation. Claim an external attachment or upload only after it actually succeeds.

The showcase is complete when verification passed, the real Electron renderer was used, controlled state was rehearsed and reset, the validated artifact contains one clean take, and temporary state is removed.

## Native UI boundary

CDP automation controls the Electron renderer, not native file pickers, credential prompts, permission dialogs, shell windows, or external applications. Prepare incidental native state before recording. When a native surface is essential to the feature, report that renderer-only capture is insufficient instead of simulating the interaction.
