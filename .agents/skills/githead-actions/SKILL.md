---
name: githead-actions
description: Configure or explain Githead repository actions. Use for adding or editing .githead/actions.toml or .githead/actions.local.toml; resolving shared and local overrides or ordering; or diagnosing action validation and editability errors.
---

# Githead Actions

Githead repository actions are commands in the Actions menu. Use this workflow for each request.

## 1. Inspect the repository

- Read `.githead/actions.toml` and `.githead/actions.local.toml` when they exist.
- Find reusable commands in repository files such as `package.json`, build scripts, task files, and project documentation.
- Use an explicit command from the user as written unless its selected shell requires different syntax.

This step is complete when every affected existing action is known and each requested command comes from repository evidence or an explicit user instruction.

## 2. Select the target file

- Use `.githead/actions.toml` for shared actions that belong in the repository.
- Use `.githead/actions.local.toml` for private machine-local actions and local overrides. Keep it out of version control. Prefer `.git/info/exclude` when the ignore rule must remain local to one clone.
- Treat names as equal after trimming and case-insensitive comparison. A local action with the same name replaces the shared action in its current position. A new local-only action follows the shared actions.

This step is complete when the target file and the effect on the final action list are clear.

## 3. Change or explain the action

Each action is a `[[actions]]` TOML table with these fields:

- `name`: required, non-empty, and unique within its file after normalized name comparison.
- `description`: optional string shown in the tooltip.
- `command`: required, non-empty, and valid for the selected shell.
- `shell`: required; use `powershell`, `cmd`, or `bash`.

Use `>` between name segments to create nested Actions menus. Githead trims whitespace around each segment and supports paths at any depth, such as `Packaging > Windows > Package`. A name with an empty segment, such as `Packaging > > Package`, remains a regular flat action name.

Create the `.githead` directory at the repository root when it is absent. The two action files can contain zero or more action tables. An absent or empty file defines no actions.

Use repository-relative commands because Githead runs each action from the repository root.

When you edit an existing file, preserve its comments, order, and fields that are outside the request. Githead reads comments and unknown fields, but its action manager makes these files read-only. For files that users must edit through the action manager, use only the four managed fields and omit comments.

Use this minimal form for a new action:

```toml
[[actions]]
name = "Build"
description = "Compile the application and check the output."
command = "vp run build"
shell = "powershell"
```

For an explanation-only request, report the source file, effective command, shell, and override behavior, and then stop.

This step is complete when the requested edit is present or the explanation accounts for every relevant field and override.

## 4. Verify the effective result

- Parse or re-read each changed TOML file.
- Confirm that every action has a name, command, and supported shell.
- Confirm that normalized names are unique within each file.
- Resolve the final order: shared actions first; local matches replace them in place; new local actions append.
- Confirm that referenced repository commands exist when they can be inspected.
- Run the repository's existing targeted validation when it covers action configuration.

The work is complete when the requested action appears once in the intended effective position, is configured with the intended command and shell, and all unrelated actions keep their prior behavior.

Configured actions use Githead's workspace trust prompt and Activity Log flow.

## Action contract

- The configuration root is a TOML table. `actions` is the only managed top-level field.
- Each action uses an `[[actions]]` array table. Other action shapes are invalid.
- Githead trims `name`, `description`, `command`, and `shell` values when it reads them.
- `name`, `command`, and `shell` must be strings with content after trimming. `description`, when present, must be a string.
- Action names must be unique within one file after trimming and case-insensitive comparison.
- The supported shell values are exactly `powershell`, `cmd`, and `bash`.
- Githead reads the shared file first and the local file second. A matching local name replaces the shared action in place. A new local name appends after all shared actions.
- A parse or validation error in either file prevents Githead from producing the effective action list until the error is fixed.
- Comments and unknown fields remain readable, but they prevent edits through Githead's action manager. Manual edits must preserve this content.
