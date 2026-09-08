// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createGitheadMock } from "./AppTestHarness";
import { MarkdownDocument } from "./MarkdownDocument";

beforeEach(() => {
  window.githead = createGitheadMock();
  vi.mocked(window.githead.cancelRepositoryRead).mockResolvedValue(undefined);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

function show(text: string): void {
  render(<TooltipProvider><MarkdownDocument text={text} repoPath="/repo" path="docs/README.md" source={{ kind: "commit", hash: "abc123" }} /></TooltipProvider>);
}

it("opens relative documents at the selected revision and returns to the original", async () => {
  vi.mocked(window.githead.getFilePreview).mockResolvedValue({ path: "guide.md", text: "# Guide\n\n## Install" });
  show("# Start\n\n[Guide](../guide.md#install)");
  fireEvent.click(screen.getByRole("link", { name: "Guide" }));
  await screen.findByRole("heading", { name: "Guide" });
  expect(window.githead.getFilePreview).toHaveBeenCalledWith(expect.objectContaining({
    repoPath: "/repo", path: "guide.md", source: { kind: "commit", hash: "abc123" }
  }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Install" }));
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  await screen.findByRole("heading", { name: "Start" });
});

it("loads local image bytes through the repository API and releases the object URL", async () => {
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.mocked(window.githead.getFilePreviewImage).mockResolvedValue({ data: new Uint8Array([1]), byteLength: 1, mimeType: "image/png" });
  show("![Example](../image.png)");
  await screen.findByRole("img", { name: "Example" });
  expect(window.githead.getFilePreviewImage).toHaveBeenCalledWith(expect.objectContaining({ path: "image.png", source: { kind: "commit", hash: "abc123" } }));
  cleanup();
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview"));
  create.mockRestore(); revoke.mockRestore();
});

it("searches the rendered text, navigates headings, and shows the selected source line", async () => {
  show("# Start\n\nRead **this** guide.\n\n## Install\n\nRead this guide.");
  fireEvent.click(screen.getByRole("button", { name: "Document outline" }));
  fireEvent.click(screen.getByRole("button", { name: "Install" }));
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Install" }));
  fireEvent.click(screen.getByRole("button", { name: "Find in preview" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Find in preview" }), { target: { value: "Read this" } });
  await screen.findByText("1 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Next match" }));
  await screen.findByText("2 of 2");
  fireEvent.click(screen.getByRole("button", { name: "Split view" }));
  fireEvent.click(screen.getByRole("heading", { name: "Install" }));
  expect(screen.getByRole("option", { selected: true }).textContent).toContain("5");
  expect(screen.getByRole("option", { selected: true }).textContent).toContain("## Install");
});

it("expands an image, changes zoom, and restores fit width", async () => {
  show("![Example](https://example.test/image.png)");
  fireEvent.click(screen.getByRole("button", { name: "Expand image" }));
  await screen.findByRole("dialog", { name: "Example" });
  fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
  expect(screen.getByText("125%")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Fit width" }));
  expect(screen.getByText("100%")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
