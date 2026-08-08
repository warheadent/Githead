// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { createRepositoryOperationState, githead, repoPath } from "./AppTestHarness";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";

describe("ConflictResolutionDialog", () => {
  it("keeps staging locked until the user explicitly chooses or edits a marker-free result", async () => {
    const operation = createRepositoryOperationState("merge");
    vi.mocked(githead.getConflictResolution).mockResolvedValue({
      outcome: "ready",
      path: "conflict.txt",
      state: operation,
      baseText: "base\n",
      currentText: "current\n",
      incomingText: "incoming\n",
      workingText: "<<<<<<< HEAD\ncurrent\n=======\nincoming\n>>>>>>> topic\n",
      workingHash: "working-hash",
      message: "Choose a result."
    });
    const onSave = vi.fn().mockResolvedValue(null);
    const onOpenChange = vi.fn();

    render(
      <ConflictResolutionDialog
        open
        repoPath={repoPath}
        initialPath="conflict.txt"
        operation={operation}
        busy={false}
        onOpenChange={onOpenChange}
        onOpenFile={vi.fn()}
        onSave={onSave}
      />
    );

    expect(await screen.findByRole("dialog", { name: "Resolve conflict.txt" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Current branch" }).textContent).toContain("current");
    expect(screen.getByRole("region", { name: "Incoming branch" }).textContent).toContain("incoming");
    expect(screen.getByRole("button", { name: "Save and stage" })).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Use incoming" }));
    expect(screen.getByRole("textbox", { name: "Resolved file content" })).toHaveProperty("value", "incoming\n");
    fireEvent.click(screen.getByRole("button", { name: "Save and stage" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      repoPath,
      path: "conflict.txt",
      expectedKind: "merge",
      expectedStateId: operation.stateId,
      expectedWorkingHash: "working-hash",
      resolvedText: "incoming\n"
    }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("falls back to the configured editor for unsupported conflicts", async () => {
    const operation = createRepositoryOperationState("rebase");
    vi.mocked(githead.getConflictResolution).mockResolvedValue({
      outcome: "unsupported",
      path: "conflict.txt",
      state: operation,
      baseText: null,
      currentText: null,
      incomingText: null,
      workingText: null,
      workingHash: null,
      message: "This conflict is binary or is not valid UTF-8."
    });
    const onOpenFile = vi.fn();

    render(
      <ConflictResolutionDialog
        open
        repoPath={repoPath}
        initialPath="conflict.txt"
        operation={operation}
        busy={false}
        onOpenChange={vi.fn()}
        onOpenFile={onOpenFile}
        onSave={vi.fn()}
      />
    );

    expect(await screen.findByText("This conflict cannot be edited here")).toBeTruthy();
    expect(screen.getByText(/binary or is not valid UTF-8/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Open in editor" })[0]!);
    expect(onOpenFile).toHaveBeenCalledWith("conflict.txt");
  });

  it("renders syntax tokens, line gutters, and operation-aware diff bands", async () => {
    const operation = createRepositoryOperationState("merge", {
      conflictedPaths: ["policy.ts"]
    });
    vi.mocked(githead.getConflictResolution).mockResolvedValue({
      outcome: "ready",
      path: "policy.ts",
      state: operation,
      baseText: "export const retries = 2;\n",
      currentText: "export const retries = 4;\n",
      incomingText: "export const retries = 6;\n",
      workingText: "<<<<<<< HEAD\nexport const retries = 4;\n=======\nexport const retries = 6;\n>>>>>>> topic\n",
      workingHash: "working-hash",
      message: "Choose a result."
    });

    render(
      <ConflictResolutionDialog
        open
        repoPath={repoPath}
        initialPath="policy.ts"
        operation={operation}
        busy={false}
        onOpenChange={vi.fn()}
        onOpenFile={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(await screen.findByRole("dialog", { name: "Resolve policy.ts" })).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".conflict-code-line-number").length).toBeGreaterThan(0));
    expect(document.querySelectorAll(".conflict-code-line.delete").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".conflict-code-line.add").length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".conflict-code-line.marker")).toHaveLength(3);
    expect(document.querySelectorAll(".conflict-code-text .hljs-keyword").length).toBeGreaterThan(0);
    expect(screen.getByRole("textbox", { name: "Resolved file content" })).toHaveProperty("value", expect.stringContaining("<<<<<<< HEAD"));
  });
});
