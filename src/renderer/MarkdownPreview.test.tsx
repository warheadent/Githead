// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { GitheadApi } from "@/shared/types";
import { MarkdownPreview } from "./MarkdownPreview";

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
