export interface PushToBranchDialogState {
  open: boolean;
  sourceBranch: string;
  remoteName: string;
  destinationMode: "existing" | "new";
  destinationBranch: string;
  newBranchName: string;
  error: string;
}

export const emptyPushToBranchDialog: PushToBranchDialogState = {
  open: false,
  sourceBranch: "",
  remoteName: "",
  destinationMode: "existing",
  destinationBranch: "",
  newBranchName: "",
  error: ""
};
