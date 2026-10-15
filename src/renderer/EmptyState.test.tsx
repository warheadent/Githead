// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { EmptyState } from "./EmptyState";

afterEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("keeps the message in one text node for exact queries", () => {
    render(<EmptyState title="Select a file to view the diff" />);

    const title = screen.getByText("Select a file to view the diff");
    expect(title.childNodes).toHaveLength(1);
    expect(title.closest(".empty-state")?.classList.contains("is-error")).toBe(false);
  });

  it("marks error states and forwards the requested role", () => {
    render(<EmptyState tone="error" role="alert" title="Unable to load commit message. Restart Githead and try again." />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Unable to load commit message. Restart Githead and try again.");
    expect(alert.classList.contains("empty-state")).toBe(true);
    expect(alert.classList.contains("is-error")).toBe(true);
  });

  it("renders an optional heading, description, icon and action", () => {
    render(
      <EmptyState
        headingLevel={3}
        icon={<svg data-testid="icon" />}
        title="No stashes"
        description="Stash changes to set them aside."
        action={<button type="button">Stash changes</button>}
      />
    );

    expect(screen.getByRole("heading", { level: 3, name: "No stashes" })).toBeTruthy();
    expect(screen.getByText("Stash changes to set them aside.")).toBeTruthy();
    expect(screen.getByTestId("icon").parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Stash changes" })).toBeTruthy();
  });
});
