import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiSettingsSaveRequest,
  RepositoryAiSettingsRequest,
  RepositoryAiSettingsSaveRequest,
  RepositorySyncSettingsRequest,
  RepositorySyncSettingsSaveRequest,
  GetAiReasoningCapabilitiesRequest,
  AppSettingsSaveRequest,
  ClipboardTextRequest,
  CancelRepositoryReadRequest,
  CancelGitOperationRequest,
  GetGitOperationStatesRequest,
  CoordinatedRequest,
  CreateIssueRequest,
  CreatePullRequestRequest,
  ExternalUrlRequest,
  GeneratePrDescriptionRequest,
  GeneratePrTitleRequest,
  FileSystemPathListRequest,
  FileSystemPathRequest,
  GitBranchRequest,
  GitRemoteBranchCheckoutRequest,
  GitHubPullRequestCheckoutRequest,
  GitRenameBranchRequest,
  GitDeleteBranchRequest,
  GitAddRemoteRequest,
  GitAmendExecuteRequest,
  GitAmendPreviewRequest,
  GitAmendRestoreRequest,
  GitCloneRequest,
  GitConfiguredActionRunRequest,
  GitConfiguredActionSaveRequest,
  GitConflictResolutionRequest,
  GitConflictResolutionSaveRequest,
  GitCommitDetailsRequest,
  GitCommitFileDiffRequest,
  GitCommitFileResetRequest,
  GitCommitFileVersionRequest,
  GitCommitHashRequest,
  GitCommitHistoryRequest,
  GenerateCommitMessageRequest,
  GenerateCommitPlanRequest,
  CommitPlanValidationRequest,
  GitCommitRequest,
  GitUndoCommitRequest,
  GitQuickCommitRequest,
  GitCreateTagRequest,
  GitDeleteTagRequest,
  GitFileChangesRequest,
  GitFileDiffRequest,
  GitFileHistoryRequest,
  GitForceWithLeaseRequest,
  GitFileBlameRequest,
  GitFilePreviewRequest,
  GitHunkRequest,
  GitLfsImageFetchRequest,
  GitHubWorkflowRunRequest,
  GitHubWorkflowRunsRequest,
  GitHubPullRequestsRequest,
  GitHubPullRequestDetailRequest,
  GitHubPullRequestMergeRequest,
  GitHubPullRequestReviewRequest,
  GitHubItemCommentRequest,
  GitHubIssueDetailRequest,
  GitHubIssuesRequest,
  GitHubHistoryInsightsRequest,
  GitHubConnectionRequest,
  GitHubDeviceFlowPollRequest,
  GitHubRepositoryRequest,
  GitIdentitySaveRequest,
  GitIgnorePathRequest,
  GitIntegrationExecuteRequest,
  GitIntegrationPreviewRequest,
  GitOutputEvent,
  GitPathRequest,
  GitPublishBranchRequest,
  GitPullRecoveryRequest,
  GitRepositoryOperationActionRequest,
  GitRemoveRemoteRequest,
  GitRenameRemoteRequest,
  GitRepositoryAccessCheckRequest,
  RepositoryGroupsRequest,
  RepositoryRecentSelectionRequest,
  GitResetCommitRequest,
  GitRunRequest,
  GitSafeDirectoryRequest,
  GitStashBranchRequest,
  GitStashCreateRequest,
  GitStashDetailsRequest,
  GitStashFileDiffRequest,
  GitStashListRequest,
  GitStashRefRequest,
  GitSetRemoteUrlRequest,
  GitSubmoduleRequest,
  GitUpstreamRequest,
  GitWorktreeCreateRequest,
  GitWorktreeRequest,
  GitWorktreeRemoveRequest,
  GitheadApi,
  AppUpdateState,
  AppWindowState,
  RepoChangedEvent,
  RepositoryRecentReplacementRequest,
  RepoSectionRequest,
  RepoSummaryReadRequest,
  RepoTrustRequest,
  RepoSummary
} from "../shared/types";

const api: GitheadApi = {
  getGitExecutableStatus: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitExecutableStatus) as ReturnType<GitheadApi["getGitExecutableStatus"]>,
  chooseRepo: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseRepo, defaultPath) as Promise<string | null>,
  chooseCloneParent: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseCloneParent, defaultPath) as Promise<string | null>,
  chooseWorktreeParent: (defaultPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.chooseWorktreeParent, defaultPath) as ReturnType<GitheadApi["chooseWorktreeParent"]>,
  getRepoSummary: (repoPath: string, requestId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoSummary, {
      repoPath,
      ...(requestId ? { requestId } : {})
    } satisfies RepoSummaryReadRequest) as Promise<RepoSummary>,
  getRepoIdentity: (request: RepoSectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoIdentity, request) as ReturnType<GitheadApi["getRepoIdentity"]>,
  getRepoStatus: (request: RepoSectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoStatus, request) as ReturnType<GitheadApi["getRepoStatus"]>,
  getRepoMetadata: (request: RepoSectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoMetadata, request) as ReturnType<GitheadApi["getRepoMetadata"]>,
  getRepositoryOperationState: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepositoryOperationState, repoPath) as ReturnType<GitheadApi["getRepositoryOperationState"]>,
  resolveRepositoryOperation: (request: CoordinatedRequest<GitRepositoryOperationActionRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolveRepositoryOperation, request) as ReturnType<GitheadApi["resolveRepositoryOperation"]>,
  getConflictResolution: (request: GitConflictResolutionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getConflictResolution, request) as ReturnType<GitheadApi["getConflictResolution"]>,
  saveConflictResolution: (request: CoordinatedRequest<GitConflictResolutionSaveRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveConflictResolution, request) as ReturnType<GitheadApi["saveConflictResolution"]>,
  cancelRepositoryRead: (request: CancelRepositoryReadRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelRepositoryRead, request) as ReturnType<GitheadApi["cancelRepositoryRead"]>,
  getGitOperationStates: (request: GetGitOperationStatesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitOperationStates, request) as ReturnType<GitheadApi["getGitOperationStates"]>,
  cancelGitOperation: (request: CancelGitOperationRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelGitOperation, request) as ReturnType<GitheadApi["cancelGitOperation"]>,
  watchRepoChanges: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.watchRepoChanges, repoPath) as ReturnType<GitheadApi["watchRepoChanges"]>,
  unwatchRepoChanges: (repoPath?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.unwatchRepoChanges, repoPath) as ReturnType<GitheadApi["unwatchRepoChanges"]>,
  getRepoRecents: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoRecents) as ReturnType<GitheadApi["getRepoRecents"]>,
  getRepoSyncStatuses: (repoPaths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoSyncStatuses, repoPaths) as ReturnType<GitheadApi["getRepoSyncStatuses"]>,
  addRepoRecent: (request: RepositoryRecentSelectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRepoRecent, request) as ReturnType<GitheadApi["addRepoRecent"]>,
  replaceRepoRecent: (request: RepositoryRecentReplacementRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.replaceRepoRecent, request) as ReturnType<GitheadApi["replaceRepoRecent"]>,
  removeRepoRecent: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRepoRecent, repoPath) as ReturnType<GitheadApi["removeRepoRecent"]>,
  reorderRepoRecents: (repoPaths: string[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.reorderRepoRecents, repoPaths) as ReturnType<GitheadApi["reorderRepoRecents"]>,
  getRepositoryGroups: (request: RepositoryGroupsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepositoryGroups, request) as ReturnType<GitheadApi["getRepositoryGroups"]>,
  getRepoTrust: (request: RepoTrustRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepoTrust, request) as ReturnType<GitheadApi["getRepoTrust"]>,
  addRepoTrust: (request: RepoTrustRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRepoTrust, request) as ReturnType<GitheadApi["addRepoTrust"]>,
  addSafeDirectory: (request: CoordinatedRequest<GitSafeDirectoryRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.addSafeDirectory, request) as ReturnType<GitheadApi["addSafeDirectory"]>,
  getGitHubWorkflowRuns: (request: GitHubWorkflowRunsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubWorkflowRuns, request) as ReturnType<GitheadApi["getGitHubWorkflowRuns"]>,
  getGitHubWorkflowRunDetail: (request: GitHubWorkflowRunRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubWorkflowRunDetail, request) as ReturnType<GitheadApi["getGitHubWorkflowRunDetail"]>,
  rerunGitHubWorkflowRun: (request: CoordinatedRequest<GitHubWorkflowRunRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.rerunGitHubWorkflowRun, request) as ReturnType<GitheadApi["rerunGitHubWorkflowRun"]>,
  cancelGitHubWorkflowRun: (request: CoordinatedRequest<GitHubWorkflowRunRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelGitHubWorkflowRun, request) as ReturnType<GitheadApi["cancelGitHubWorkflowRun"]>,
  getGitHubViewer: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubViewer, request) as ReturnType<GitheadApi["getGitHubViewer"]>,
  getGitHubOpenCounts: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubOpenCounts, request) as ReturnType<GitheadApi["getGitHubOpenCounts"]>,
  getGitHubIssues: (request: GitHubIssuesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubIssues, request) as ReturnType<GitheadApi["getGitHubIssues"]>,
  getGitHubIssueTemplates: (request: GitHubRepositoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubIssueTemplates, request) as ReturnType<GitheadApi["getGitHubIssueTemplates"]>,
  createGitHubIssue: (request: CoordinatedRequest<CreateIssueRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createGitHubIssue, request) as ReturnType<GitheadApi["createGitHubIssue"]>,
  getGitHubPullRequests: (request: GitHubPullRequestsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubPullRequests, request) as ReturnType<GitheadApi["getGitHubPullRequests"]>,
  getGitHubPullRequestDetail: (request: GitHubPullRequestDetailRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubPullRequestDetail, request) as ReturnType<GitheadApi["getGitHubPullRequestDetail"]>,
  getGitHubIssueDetail: (request: GitHubIssueDetailRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubIssueDetail, request) as ReturnType<GitheadApi["getGitHubIssueDetail"]>,
  approveGitHubPullRequest: (request: CoordinatedRequest<GitHubPullRequestReviewRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.approveGitHubPullRequest, request) as ReturnType<GitheadApi["approveGitHubPullRequest"]>,
  commentOnGitHubItem: (request: CoordinatedRequest<GitHubItemCommentRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.commentOnGitHubItem, request) as ReturnType<GitheadApi["commentOnGitHubItem"]>,
  mergeGitHubPullRequest: (request: CoordinatedRequest<GitHubPullRequestMergeRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.mergeGitHubPullRequest, request) as ReturnType<GitheadApi["mergeGitHubPullRequest"]>,
  getGitHubHistoryInsights: (request: GitHubHistoryInsightsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubHistoryInsights, request) as ReturnType<GitheadApi["getGitHubHistoryInsights"]>,
  createGitHubPullRequest: (request: CoordinatedRequest<CreatePullRequestRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createGitHubPullRequest, request) as ReturnType<GitheadApi["createGitHubPullRequest"]>,
  cancelGitHubRequest: (request) =>
    ipcRenderer.invoke(IPC_CHANNELS.cancelGitHubRequest, request) as ReturnType<GitheadApi["cancelGitHubRequest"]>,
  getGitHubConnection: (request: GitHubConnectionRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitHubConnection, request) as ReturnType<GitheadApi["getGitHubConnection"]>,
  beginGitHubDeviceFlow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.beginGitHubDeviceFlow) as ReturnType<GitheadApi["beginGitHubDeviceFlow"]>,
  pollGitHubDeviceFlow: (request: GitHubDeviceFlowPollRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.pollGitHubDeviceFlow, request) as ReturnType<GitheadApi["pollGitHubDeviceFlow"]>,
  disconnectGitHub: () =>
    ipcRenderer.invoke(IPC_CHANNELS.disconnectGitHub) as ReturnType<GitheadApi["disconnectGitHub"]>,
  getCommitHistory: (request: GitCommitHistoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitHistory, request) as ReturnType<GitheadApi["getCommitHistory"]>,
  getCommitDetails: (request: GitCommitDetailsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitDetails, request) as ReturnType<GitheadApi["getCommitDetails"]>,
  getCommitFileDiff: (request: GitCommitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getCommitFileDiff, request) as ReturnType<GitheadApi["getCommitFileDiff"]>,
  getFileHistory: (request: GitFileHistoryRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileHistory, request) as ReturnType<GitheadApi["getFileHistory"]>,
  getFileBlame: (request: GitFileBlameRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileBlame, request) as ReturnType<GitheadApi["getFileBlame"]>,
  getFileDiff: (request: GitFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFileDiff, request) as ReturnType<GitheadApi["getFileDiff"]>,
  getStashes: (request: GitStashListRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getStashes, request) as ReturnType<GitheadApi["getStashes"]>,
  getStashDetails: (request: GitStashDetailsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getStashDetails, request) as ReturnType<GitheadApi["getStashDetails"]>,
  getStashFileDiff: (request: GitStashFileDiffRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getStashFileDiff, request) as ReturnType<GitheadApi["getStashFileDiff"]>,
  getFilePreview: (request: GitFilePreviewRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getFilePreview, request) as ReturnType<GitheadApi["getFilePreview"]>,
  fetchLfsImageVersions: (request: CoordinatedRequest<GitLfsImageFetchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.fetchLfsImageVersions, request) as ReturnType<GitheadApi["fetchLfsImageVersions"]>,
  resetFilesToCommit: (request: CoordinatedRequest<GitCommitFileResetRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.resetFilesToCommit, request) as ReturnType<GitheadApi["resetFilesToCommit"]>,
  openCommitFileVersion: (request: CoordinatedRequest<GitCommitFileVersionRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.openCommitFileVersion, request) as ReturnType<GitheadApi["openCommitFileVersion"]>,
  stageFiles: (request: CoordinatedRequest<GitPathRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageFiles, request) as ReturnType<GitheadApi["stageFiles"]>,
  unstageFiles: (request: CoordinatedRequest<GitPathRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.unstageFiles, request) as ReturnType<GitheadApi["unstageFiles"]>,
  stageHunk: (request: CoordinatedRequest<GitHunkRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.stageHunk, request) as ReturnType<GitheadApi["stageHunk"]>,
  unstageHunk: (request: CoordinatedRequest<GitHunkRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.unstageHunk, request) as ReturnType<GitheadApi["unstageHunk"]>,
  commitChanges: (request: CoordinatedRequest<GitCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.commitChanges, request) as ReturnType<GitheadApi["commitChanges"]>,
  commitWithRemoteCheck: (request: CoordinatedRequest<GitCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.commitWithRemoteCheck, request) as ReturnType<GitheadApi["commitWithRemoteCheck"]>,
  commitAndPush: (request: CoordinatedRequest<GitCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.commitAndPush, request) as ReturnType<GitheadApi["commitAndPush"]>,
  undoCommitAndKeepStaged: (request: CoordinatedRequest<GitUndoCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.undoCommitAndKeepStaged, request) as ReturnType<GitheadApi["undoCommitAndKeepStaged"]>,
  getAmendPreview: (request: GitAmendPreviewRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getAmendPreview, request) as ReturnType<GitheadApi["getAmendPreview"]>,
  amendLastCommit: (request: CoordinatedRequest<GitAmendExecuteRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.amendLastCommit, request) as ReturnType<GitheadApi["amendLastCommit"]>,
  restoreAmendRecovery: (request: CoordinatedRequest<GitAmendRestoreRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.restoreAmendRecovery, request) as ReturnType<GitheadApi["restoreAmendRecovery"]>,
  quickCommitFiles: (request: CoordinatedRequest<GitQuickCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.quickCommitFiles, request) as ReturnType<GitheadApi["quickCommitFiles"]>,
  createStash: (request: CoordinatedRequest<GitStashCreateRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createStash, request) as ReturnType<GitheadApi["createStash"]>,
  applyStash: (request: CoordinatedRequest<GitStashRefRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.applyStash, request) as ReturnType<GitheadApi["applyStash"]>,
  popStash: (request: CoordinatedRequest<GitStashRefRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.popStash, request) as ReturnType<GitheadApi["popStash"]>,
  dropStash: (request: CoordinatedRequest<GitStashRefRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.dropStash, request) as ReturnType<GitheadApi["dropStash"]>,
  createBranchFromStash: (request: CoordinatedRequest<GitStashBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBranchFromStash, request) as ReturnType<GitheadApi["createBranchFromStash"]>,
  copyCommitShaToClipboard: (request: GitCommitHashRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyCommitShaToClipboard, request) as ReturnType<GitheadApi["copyCommitShaToClipboard"]>,
  resetBranchToCommit: (request: CoordinatedRequest<GitResetCommitRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.resetBranchToCommit, request) as ReturnType<GitheadApi["resetBranchToCommit"]>,
  revertCommit: (request: CoordinatedRequest<GitCommitHashRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.revertCommit, request) as ReturnType<GitheadApi["revertCommit"]>,
  getIntegrationPreview: (request: GitIntegrationPreviewRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getIntegrationPreview, request) as ReturnType<GitheadApi["getIntegrationPreview"]>,
  runIntegration: (request: CoordinatedRequest<GitIntegrationExecuteRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.runIntegration, request) as ReturnType<GitheadApi["runIntegration"]>,
  pushWithForceLease: (request: CoordinatedRequest<GitForceWithLeaseRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.pushWithForceLease, request) as ReturnType<GitheadApi["pushWithForceLease"]>,
  createTag: (request: CoordinatedRequest<GitCreateTagRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createTag, request) as ReturnType<GitheadApi["createTag"]>,
  deleteTag: (request: CoordinatedRequest<GitDeleteTagRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteTag, request) as ReturnType<GitheadApi["deleteTag"]>,
  switchBranch: (request: CoordinatedRequest<GitBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.switchBranch, request) as ReturnType<GitheadApi["switchBranch"]>,
  checkoutRemoteBranch: (request: CoordinatedRequest<GitRemoteBranchCheckoutRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkoutRemoteBranch, request) as ReturnType<GitheadApi["checkoutRemoteBranch"]>,
  checkoutGitHubPullRequest: (request: CoordinatedRequest<GitHubPullRequestCheckoutRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkoutGitHubPullRequest, request) as ReturnType<GitheadApi["checkoutGitHubPullRequest"]>,
  createBranch: (request: CoordinatedRequest<GitBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createBranch, request) as ReturnType<GitheadApi["createBranch"]>,
  renameBranch: (request: CoordinatedRequest<GitRenameBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameBranch, request) as ReturnType<GitheadApi["renameBranch"]>,
  deleteBranch: (request: CoordinatedRequest<GitDeleteBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteBranch, request) as ReturnType<GitheadApi["deleteBranch"]>,
  createWorktree: (request: CoordinatedRequest<GitWorktreeCreateRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.createWorktree, request) as ReturnType<GitheadApi["createWorktree"]>,
  checkWorktreeRemoval: (request: GitWorktreeRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkWorktreeRemoval, request) as ReturnType<GitheadApi["checkWorktreeRemoval"]>,
  removeWorktree: (request: CoordinatedRequest<GitWorktreeRemoveRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeWorktree, request) as ReturnType<GitheadApi["removeWorktree"]>,
  setBranchUpstream: (request: CoordinatedRequest<GitUpstreamRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.setBranchUpstream, request) as ReturnType<GitheadApi["setBranchUpstream"]>,
  publishBranch: (request: CoordinatedRequest<GitPublishBranchRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.publishBranch, request) as ReturnType<GitheadApi["publishBranch"]>,
  getPullRecovery: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getPullRecovery, repoPath) as ReturnType<GitheadApi["getPullRecovery"]>,
  resolvePullRecovery: (request: CoordinatedRequest<GitPullRecoveryRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.resolvePullRecovery, request) as ReturnType<GitheadApi["resolvePullRecovery"]>,
  getRemoteConfigs: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRemoteConfigs, repoPath) as ReturnType<GitheadApi["getRemoteConfigs"]>,
  addRemote: (request: CoordinatedRequest<GitAddRemoteRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.addRemote, request) as ReturnType<GitheadApi["addRemote"]>,
  renameRemote: (request: CoordinatedRequest<GitRenameRemoteRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.renameRemote, request) as ReturnType<GitheadApi["renameRemote"]>,
  setRemoteUrl: (request: CoordinatedRequest<GitSetRemoteUrlRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.setRemoteUrl, request) as ReturnType<GitheadApi["setRemoteUrl"]>,
  removeRemote: (request: CoordinatedRequest<GitRemoveRemoteRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.removeRemote, request) as ReturnType<GitheadApi["removeRemote"]>,
  getGitIdentity: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.getGitIdentity, repoPath) as ReturnType<GitheadApi["getGitIdentity"]>,
  saveGitIdentity: (request: CoordinatedRequest<GitIdentitySaveRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveGitIdentity, request) as ReturnType<GitheadApi["saveGitIdentity"]>,
  getAiSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAiSettings) as ReturnType<GitheadApi["getAiSettings"]>,
  saveAiSettings: (request: AiSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAiSettings, request) as ReturnType<GitheadApi["saveAiSettings"]>,
  getRepositoryAiSettings: (request: RepositoryAiSettingsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepositoryAiSettings, request) as ReturnType<GitheadApi["getRepositoryAiSettings"]>,
  saveRepositoryAiSettings: (request: RepositoryAiSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveRepositoryAiSettings, request) as ReturnType<GitheadApi["saveRepositoryAiSettings"]>,
  getRepositorySyncSettings: (request: RepositorySyncSettingsRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getRepositorySyncSettings, request) as ReturnType<GitheadApi["getRepositorySyncSettings"]>,
  saveRepositorySyncSettings: (request: RepositorySyncSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveRepositorySyncSettings, request) as ReturnType<GitheadApi["saveRepositorySyncSettings"]>,
  getAiReasoningCapabilities: (request: GetAiReasoningCapabilitiesRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.getAiReasoningCapabilities, request) as ReturnType<GitheadApi["getAiReasoningCapabilities"]>,
  getAppSettings: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getAppSettings) as ReturnType<GitheadApi["getAppSettings"]>,
  saveAppSettings: (request: AppSettingsSaveRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveAppSettings, request) as ReturnType<GitheadApi["saveAppSettings"]>,
  setWindowZoomFactor: (zoomFactor: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.setWindowZoomFactor, zoomFactor) as ReturnType<GitheadApi["setWindowZoomFactor"]>,
  generateCommitMessage: (request: CoordinatedRequest<GenerateCommitMessageRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCommitMessage, request) as ReturnType<GitheadApi["generateCommitMessage"]>,
  generateCommitPlan: (request: CoordinatedRequest<GenerateCommitPlanRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.generateCommitPlan, request) as ReturnType<GitheadApi["generateCommitPlan"]>,
  validateCommitPlan: (request: CommitPlanValidationRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.validateCommitPlan, request) as ReturnType<GitheadApi["validateCommitPlan"]>,
  generatePrTitle: (request: CoordinatedRequest<GeneratePrTitleRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePrTitle, request) as ReturnType<GitheadApi["generatePrTitle"]>,
  generatePrDescription: (request: CoordinatedRequest<GeneratePrDescriptionRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.generatePrDescription, request) as ReturnType<GitheadApi["generatePrDescription"]>,
  openExternalUrl: (request: ExternalUrlRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openExternalUrl, request) as ReturnType<GitheadApi["openExternalUrl"]>,
  openFile: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.openFile, request) as ReturnType<GitheadApi["openFile"]>,
  showInExplorer: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.showInExplorer, request) as ReturnType<GitheadApi["showInExplorer"]>,
  showRepositoryInExplorer: (repoPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.showRepositoryInExplorer, repoPath) as ReturnType<GitheadApi["showRepositoryInExplorer"]>,
  copyPathToClipboard: (request: FileSystemPathRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyPathToClipboard, request) as ReturnType<GitheadApi["copyPathToClipboard"]>,
  copyTextToClipboard: (request: ClipboardTextRequest) =>
    ipcRenderer.invoke(IPC_CHANNELS.copyTextToClipboard, request) as ReturnType<GitheadApi["copyTextToClipboard"]>,
  deleteFile: (request: CoordinatedRequest<FileSystemPathRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteFile, request) as ReturnType<GitheadApi["deleteFile"]>,
  deleteFiles: (request: CoordinatedRequest<FileSystemPathListRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.deleteFiles, request) as ReturnType<GitheadApi["deleteFiles"]>,
  revertFileChanges: (request: CoordinatedRequest<GitFileChangesRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.revertFileChanges, request) as ReturnType<GitheadApi["revertFileChanges"]>,
  addPathToIgnore: (request: CoordinatedRequest<GitIgnorePathRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.addPathToIgnore, request) as ReturnType<GitheadApi["addPathToIgnore"]>,
  cloneRepository: (request: CoordinatedRequest<GitCloneRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.cloneRepository, request) as ReturnType<GitheadApi["cloneRepository"]>,
  updateSubmodules: (request: CoordinatedRequest<GitSubmoduleRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.updateSubmodules, request) as ReturnType<GitheadApi["updateSubmodules"]>,
  syncSubmodules: (request: CoordinatedRequest<GitSubmoduleRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.syncSubmodules, request) as ReturnType<GitheadApi["syncSubmodules"]>,
  checkRepositoryAccess: (request: CoordinatedRequest<GitRepositoryAccessCheckRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.checkRepositoryAccess, request) as ReturnType<GitheadApi["checkRepositoryAccess"]>,
  runGitAction: (request: CoordinatedRequest<GitRunRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.runGitAction, request) as ReturnType<GitheadApi["runGitAction"]>,
  runConfiguredAction: (request: CoordinatedRequest<GitConfiguredActionRunRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.runConfiguredAction, request) as ReturnType<GitheadApi["runConfiguredAction"]>,
  saveConfiguredActions: (request: CoordinatedRequest<GitConfiguredActionSaveRequest>) =>
    ipcRenderer.invoke(IPC_CHANNELS.saveConfiguredActions, request) as ReturnType<GitheadApi["saveConfiguredActions"]>,
  getUpdateState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getUpdateState) as ReturnType<GitheadApi["getUpdateState"]>,
  checkForUpdates: () =>
    ipcRenderer.invoke(IPC_CHANNELS.checkForUpdates) as ReturnType<GitheadApi["checkForUpdates"]>,
  downloadUpdate: () =>
    ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate) as ReturnType<GitheadApi["downloadUpdate"]>,
  installUpdate: () =>
    ipcRenderer.invoke(IPC_CHANNELS.installUpdate) as ReturnType<GitheadApi["installUpdate"]>,
  minimizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow) as ReturnType<GitheadApi["minimizeWindow"]>,
  toggleMaximizeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.toggleMaximizeWindow) as ReturnType<GitheadApi["toggleMaximizeWindow"]>,
  closeWindow: () =>
    ipcRenderer.invoke(IPC_CHANNELS.closeWindow) as ReturnType<GitheadApi["closeWindow"]>,
  getWindowState: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getWindowState) as ReturnType<GitheadApi["getWindowState"]>,
  startPerformanceDiagnostics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.startPerformanceDiagnostics) as ReturnType<GitheadApi["startPerformanceDiagnostics"]>,
  getPerformanceDiagnosticsSnapshot: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getPerformanceDiagnosticsSnapshot) as ReturnType<GitheadApi["getPerformanceDiagnosticsSnapshot"]>,
  stopPerformanceDiagnostics: () =>
    ipcRenderer.invoke(IPC_CHANNELS.stopPerformanceDiagnostics) as ReturnType<GitheadApi["stopPerformanceDiagnostics"]>,
  recordPerformanceRefresh: (record) => {
    ipcRenderer.send(IPC_CHANNELS.recordPerformanceRefresh, record);
  },
  onGitOutput: (callback: (event: GitOutputEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, output: GitOutputEvent) => {
      callback(output);
    };

    ipcRenderer.on(IPC_CHANNELS.gitOutput, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.gitOutput, listener);
    };
  },
  onRepoChanged: (callback: (event: RepoChangedEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, repoChanged: RepoChangedEvent) => {
      callback(repoChanged);
    };

    ipcRenderer.on(IPC_CHANNELS.repoChanged, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.repoChanged, listener);
    };
  },
  onUpdateState: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, updateState: AppUpdateState) => {
      callback(updateState);
    };

    ipcRenderer.on(IPC_CHANNELS.updateState, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updateState, listener);
    };
  },
  onWindowState: (callback: (state: AppWindowState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, windowState: AppWindowState) => {
      callback(windowState);
    };

    ipcRenderer.on(IPC_CHANNELS.windowState, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.windowState, listener);
    };
  }
};

contextBridge.exposeInMainWorld("githead", api);
