# Githead

Githead is a desktop Git client for operating on one selected local repository at a time. This glossary keeps repository, branch, and sync language consistent across the app.

## Language

**Repository**:
A local Git working tree selected as the active workspace in Githead.
_Avoid_: Folder, project

**Branch**:
A local Git branch in the selected **Repository**. A repository may have zero or more branches, and at most one branch is current.
_Avoid_: Ref, checkout

**Current Branch**:
The branch currently checked out in the selected **Repository**. New commits are made on the current branch.
_Avoid_: Selected branch, active ref

**Upstream**:
The remote-tracking branch configured for the **Current Branch**.
_Avoid_: Remote, origin branch

**Remote**:
A named Git remote configured for the **Repository**. A repository may have zero or more remotes.
_Avoid_: Upstream

**GitHub Origin**:
The **Remote** named `origin` when it points to a GitHub repository that Githead can query for GitHub data.
_Avoid_: GitHub upstream

**Live Update**:
Githead's current view of a **Repository** catching up after the repository changes or Githead returns to focus.
_Avoid_: Polling refresh, refresh loop

**File Status**:
The current staged and unstaged file list for the selected **Repository**.
_Avoid_: Diff list, change feed

**Diff Preview**:
The currently displayed diff for a user-selected file and side in **File Status**.
_Avoid_: File status, live diff

## Example Dialogue

Dev: "Should switching repositories also change the current branch?"

Domain expert: "No. A repository has its own current branch. When Githead selects a different repository, it should report that repository's current branch."

Dev: "When creating a branch, should we call it an upstream?"

Domain expert: "No. A branch is local. It may have an upstream later, but upstream specifically means the remote-tracking branch configured for the current branch."
