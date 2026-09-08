// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { GitIgnoreFileDialog } from "./GitIgnoreFileDialog";

afterEach(cleanup);
function setup() {
  const file = { filePath: "/global/ignore", contents: "*.log\n", revision: "initial" };
  const getGitIgnoreFile = vi.fn(async () => file);
  const saveGitIgnoreFile = vi.fn(async () => ({ ...file, revision: "saved" }));
  Object.defineProperty(window, "githead", { configurable: true, value: { getGitIgnoreFile, saveGitIgnoreFile } });
  const onClose = vi.fn();
  render(<GitIgnoreFileDialog open request={{ repoPath: "/repo", scope: "global" }} onClose={onClose} />);
  return { file, saveGitIgnoreFile, onClose };
}

describe("Ignore file editor", () => {
  it("saves patterns with the original path and revision", async () => {
    const { file, saveGitIgnoreFile, onClose } = setup();
    await screen.findByDisplayValue("*.log");
    fireEvent.change(screen.getByLabelText("Ignore patterns"), { target: { value: "*.local\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save ignore file" }));
    await waitFor(() => expect(saveGitIgnoreFile).toHaveBeenCalledWith(expect.objectContaining({ ...file, contents: "*.local\n", repoPath: "/repo", scope: "global" })));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("protects unsaved patterns and retains them after a rejected save", async () => {
    const { saveGitIgnoreFile, onClose } = setup();
    await screen.findByDisplayValue("*.log");
    fireEvent.change(screen.getByLabelText("Ignore patterns"), { target: { value: "*.local\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText("Discard ignore file edits?");
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    saveGitIgnoreFile.mockRejectedValueOnce(new Error("File changed elsewhere."));
    fireEvent.click(screen.getByRole("button", { name: "Save ignore file" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByLabelText("Ignore patterns") as HTMLTextAreaElement).value).toBe("*.local\n");
    expect(onClose).not.toHaveBeenCalled();
  });
});
