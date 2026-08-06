// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitheadApi } from "@/shared/types";
import { MarkdownPreview } from "./MarkdownPreview";

const renderMermaid = vi.fn();
const initializeMermaid = vi.fn();

vi.mock("mermaid", () => ({
  default: {
    initialize: initializeMermaid,
    render: renderMermaid
  }
}));

const copyTextToClipboard = vi.fn<GitheadApi["copyTextToClipboard"]>();

function renderPreview(text: string): void {
  render(
    <TooltipProvider>
      <MarkdownPreview text={text} />
    </TooltipProvider>
  );
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  copyTextToClipboard.mockReset();
  initializeMermaid.mockReset();
  renderMermaid.mockReset();
  renderMermaid.mockResolvedValue({ svg: "<svg><text>Rendered diagram</text></svg>" });
  copyTextToClipboard.mockResolvedValue({
    repoPath: "",
    exitCode: 0,
    stdout: "Text copied to clipboard.",
    stderr: ""
  });
  window.githead = { copyTextToClipboard } as unknown as GitheadApi;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MarkdownPreview", () => {
  it("copies each fenced code block independently and preserves its text", async () => {
    renderPreview("`inline`\n\n```ts\nconst first = 1;\n```\n\n```sh\necho second\n```");

    expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Copy code" })[1]!);
    await flushPromises();

    expect(copyTextToClipboard).toHaveBeenCalledOnce();
    expect(copyTextToClipboard).toHaveBeenCalledWith({ text: "echo second\n" });
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Code copied")).toBeTruthy();
  });

  it("does not add a copy button to inline code", () => {
    renderPreview("Use `git status` to inspect the repository.");

    expect(screen.queryByRole("button", { name: "Copy code" })).toBeNull();
  });

  it("renders Mermaid fences as diagrams and leaves other fences unchanged", async () => {
    renderPreview("```mermaid\ngraph TD\n  A --> B\n```\n\n```text\nplain text\n```");

    expect(screen.getByText("Rendering Mermaid diagram...")).toBeTruthy();
    expect(screen.getByText("plain text")).toBeTruthy();
    await vi.waitFor(() => expect(screen.getByRole("img", { name: "Mermaid diagram" })).toBeTruthy());

    expect(renderMermaid).toHaveBeenCalledOnce();
    expect(initializeMermaid).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: "strict",
      startOnLoad: false,
      suppressErrorRendering: true
    }));
    expect(renderMermaid.mock.calls[0]?.[1]).toBe("graph TD\n  A --> B");
    expect(screen.getByText("Rendered diagram")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(1);
  });

  it("shows invalid Mermaid source with a copy button", async () => {
    renderMermaid.mockRejectedValueOnce(new Error("Parse error on line 1"));
    renderPreview("```mermaid\nnot a diagram\n```");

    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Parse error on line 1"));

    expect(screen.getByText("not a diagram")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
  });

  it("keeps a table's semantic DOM stable across parent re-renders", () => {
    const text = "| Name | Description |\n| --- | --- |\n| Githead | A deliberately long table value |";
    const preview = (
      <TooltipProvider>
        <MarkdownPreview text={text} />
      </TooltipProvider>
    );
    const { rerender } = render(preview);
    const table = screen.getByRole("table");

    rerender(preview);

    expect(screen.getByRole("table")).toBe(table);
    expect(table.parentElement?.getAttribute("tabindex")).toBeNull();
  });

  it("resets successful feedback after two seconds", async () => {
    renderPreview("```ts\nconst value = true;\n```");

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await flushPromises();
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();

    act(() => vi.advanceTimersByTime(1_999));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
  });

  it("swaps the copy feedback icons through motion wrappers", async () => {
    renderPreview("```ts\nconst value = true;\n```");

    const copyButton = screen.getByRole("button", { name: "Copy code" });
    expect(copyButton.querySelector(".lucide-copy")?.parentElement?.classList).toContain("motion-presence");
    expect(copyButton.querySelector(".lucide-check")).toBeNull();

    fireEvent.click(copyButton);
    await flushPromises();

    const copiedButton = screen.getByRole("button", { name: "Copied" });
    const exitingCopy = copiedButton.querySelector(".lucide-copy")?.parentElement;
    const enteringCheck = copiedButton.querySelector(".lucide-check")?.parentElement;
    expect(exitingCopy?.dataset.motionState).toBe("exiting");
    expect(enteringCheck?.dataset.motionState).toBe("entering");
    expect(enteringCheck?.className).toContain("[--motion-scale:0.97]");
    expect(enteringCheck?.className).toContain("[--motion-reduced-opacity:0.85]");

    act(() => vi.advanceTimersByTime(120));
    expect(copiedButton.querySelector(".lucide-copy")).toBeNull();
    expect(copiedButton.querySelector(".lucide-check")).toBeTruthy();
  });

  it("keeps the newest icon feedback when rapid copy requests finish out of order", async () => {
    let resolveFirstCopy: ((value: Awaited<ReturnType<GitheadApi["copyTextToClipboard"]>>) => void) | undefined;
    copyTextToClipboard.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirstCopy = resolve;
    }));
    renderPreview("```txt\ncopy me\n```");

    const copyButton = screen.getByRole("button", { name: "Copy code" });
    fireEvent.click(copyButton);
    fireEvent.click(copyButton);
    await flushPromises();

    expect(screen.getByRole("button", { name: "Copied" }).querySelector(".lucide-check")).toBeTruthy();

    resolveFirstCopy?.({
      repoPath: "",
      exitCode: 0,
      stdout: "Text copied to clipboard.",
      stderr: ""
    });
    await flushPromises();

    expect(screen.getByRole("button", { name: "Copied" }).querySelector(".lucide-check")).toBeTruthy();
  });

  it("reports clipboard failures and allows an immediate retry", async () => {
    copyTextToClipboard.mockRejectedValueOnce(new Error("Clipboard unavailable"));
    renderPreview("```txt\nretry me\n```");

    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    await flushPromises();
    expect(screen.getByRole("button", { name: "Copy failed" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Copy failed");

    fireEvent.click(screen.getByRole("button", { name: "Copy failed" }));
    await flushPromises();
    expect(copyTextToClipboard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
});
