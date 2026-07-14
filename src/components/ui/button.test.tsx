// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { TooltipButton } from "./button"

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderTooltipButton(props: React.ComponentProps<typeof TooltipButton>) {
  return render(
    <TooltipProvider>
      <TooltipButton {...props} />
    </TooltipProvider>
  )
}

describe("TooltipButton", () => {
  it("preserves the button's accessible name and action", () => {
    const onClick = vi.fn()
    renderTooltipButton({ tooltip: "Refresh repository", "aria-label": "Refresh repository", onClick, children: "↻" })

    const button = screen.getByRole("button", { name: "Refresh repository" })
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledOnce()
  })

  it("shows its action tooltip on keyboard focus", async () => {
    renderTooltipButton({ tooltip: "Refresh repository", "aria-label": "Refresh repository", children: "↻" })

    fireEvent.focus(screen.getByRole("button", { name: "Refresh repository" }))

    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("Refresh repository"))
  })

  it("waits before showing its action tooltip on hover", () => {
    vi.useFakeTimers()
    renderTooltipButton({ tooltip: "Refresh repository", "aria-label": "Refresh repository", children: "↻" })

    fireEvent.pointerMove(screen.getByRole("button", { name: "Refresh repository" }), { pointerType: "mouse" })

    act(() => vi.advanceTimersByTime(749))
    expect(screen.queryByRole("tooltip")).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole("tooltip").textContent).toContain("Refresh repository")
  })

  it("exposes a disabled explanation without enabling the action", async () => {
    const onClick = vi.fn()
    renderTooltipButton({
      tooltip: "Delete branch",
      disabledTooltip: "Switch to another branch before deleting this branch",
      disabled: true,
      "aria-label": "Delete branch",
      onClick,
      children: "×"
    })

    const button = screen.getByRole("button", { name: "Delete branch" })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()

    fireEvent.focus(screen.getByLabelText("Switch to another branch before deleting this branch"))
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("Switch to another branch before deleting this branch"))
  })
})
