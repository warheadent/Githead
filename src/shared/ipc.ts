export const IPC_CHANNELS = {
  chooseRepo: "repo:choose",
  getRepoSummary: "repo:summary",
  getFileDiff: "git:file-diff",
  stageFiles: "git:stage-files",
  unstageFiles: "git:unstage-files",
  commitChanges: "git:commit-changes",
  openFile: "file:open",
  showInExplorer: "file:show-in-explorer",
  copyPathToClipboard: "file:copy-path",
  deleteFile: "file:delete",
  revertFileChanges: "git:revert-file",
  addPathToIgnore: "git:add-ignore",
  runGitAction: "git:run",
  gitOutput: "git:output"
} as const;
