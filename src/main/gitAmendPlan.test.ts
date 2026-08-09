import { describe, expect, it } from "vite-plus/test";
import { createGitAmendCommandPlan } from "./gitAmendPlan";

describe("git amend command planning", () => {
  it("uses --only and stdin for a message-only amend", () => {
    expect(createGitAmendCommandPlan("message-only", "new message\n", "old message")).toEqual({
      args: ["commit", "--amend", "--only", "--file=-"],
      stdin: "new message\n",
      expectedMessage: "new message",
      includesStagedChanges: false
    });
  });

  it("uses stdin when staged changes and a new message are selected", () => {
    expect(createGitAmendCommandPlan("staged-edit", "new message", "old message")).toMatchObject({
      args: ["commit", "--amend", "--file=-"],
      stdin: "new message\n",
      includesStagedChanges: true
    });
  });

  it("uses --no-edit when the old message is kept", () => {
    expect(createGitAmendCommandPlan("staged-keep", "ignored", "old message\n")).toEqual({
      args: ["commit", "--amend", "--no-edit"],
      expectedMessage: "old message",
      includesStagedChanges: true
    });
  });

  it("rejects an empty or unchanged message-only amend", () => {
    expect(() => createGitAmendCommandPlan("message-only", "  ", "old")).toThrow("Enter a commit message.");
    expect(() => createGitAmendCommandPlan("message-only", "old\n", "old")).toThrow("Change the commit message");
  });
});
