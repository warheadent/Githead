---
name: githead-actions
description: Add, edit, or explain Githead Actions for repositories. Use when working with Githead repository actions, shared actions, local actions, .githead/actions.toml, or .githead/actions.local.toml.
---

# Githead Actions

Githead repository actions are custom commands shown in the Sync bar Actions menu.

## Add an action

- Put shared, repo-committed actions in `.githead/actions.toml`.
- Put private machine-local actions or overrides in `.githead/actions.local.toml`.
- Use only `[[actions]]` TOML tables with `name`, optional `description`, `command`, and `shell`.
- Set `shell` to `powershell`, `cmd`, or `bash`.
- Keep names unique within each file.
- Prefer repo-relative commands because Githead runs actions from the repository root.
- Avoid comments and unmanaged TOML fields when the file should remain editable through Githead.

Shared action:

```toml
[[actions]]
name = "Build"
description = "Compile the application and verify production output."
command = "npm run build"
shell = "powershell"
```

Local override:

```toml
[[actions]]
name = "Build"
command = "npm run build -- --local"
shell = "powershell"
```

## Behavior to preserve

- Githead loads `.githead/actions.toml` first, then `.githead/actions.local.toml`.
- A local action with the same name replaces the shared action; name matching is case-insensitive after trimming.
- New local-only actions are appended after shared actions.
- Configured actions run through Githead's workspace trust and Activity Log flow.
