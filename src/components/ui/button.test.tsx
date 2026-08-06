// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TOOLTIP_DELAY_MS, TooltipProvider, TooltipTarget } from "@/components/ui/tooltip"
import { Button, TooltipButton } from "./button"

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

describe("Button", () => {
  it("uses precise press feedback for enabled fine-pointer interactions", () => {
    render(<Button>Commit</Button>)

    const button = screen.getByRole("button", { name: "Commit" })

    expect(button.className).toContain(
      "transition-[color,background-color,border-color,box-shadow,transform,opacity]"
    )
    expect(button.className).toContain("duration-[120ms]")
    expect(button.className).toContain("ease-[ease]")
    expect(button.className).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:enabled:active:[transform:scale(0.98)]"
    )
    expect(button.className).not.toContain("transition-all")
  })

  it("keeps disabled controls outside the active press selector", () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Commit</Button>)

    const button = screen.getByRole("button", { name: "Commit" })
    fireEvent.click(button)

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(button.className).toContain(":enabled:active:[transform:scale(0.98)]")
    expect(onClick).not.toHaveBeenCalled()
  })

  it("uses opacity instead of transforms when reduced motion is requested", () => {
    render(<Button>Commit</Button>)

    const button = screen.getByRole("button", { name: "Commit" })

    expect(button.className).toContain("motion-reduce:transition-opacity!")
    expect(button.className).toContain("motion-reduce:duration-[120ms]!")
    expect(button.className).toContain("motion-reduce:transform-none!")
    expect(button.className).toContain(
      "[@media(hover:hover)_and_(pointer:fine)]:enabled:active:motion-reduce:opacity-[0.92]"
    )
  })
})

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

    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1))
    expect(screen.queryByRole("tooltip")).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole("tooltip").textContent).toContain("Refresh repository")
  })

  it("enforces the shared delay for generic tooltip targets", () => {
    vi.useFakeTimers()
    render(
      <TooltipProvider delayDuration={0}>
        <TooltipTarget content="Full branch name"><span>branch</span></TooltipTarget>
      </TooltipProvider>
    )

    fireEvent.pointerMove(screen.getByText("branch"), { pointerType: "mouse" })

    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1))
    expect(screen.queryByRole("tooltip")).toBeNull()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole("tooltip").textContent).toContain("Full branch name")
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
