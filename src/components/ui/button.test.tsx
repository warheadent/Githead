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
  it("does not call the action when disabled", () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Commit</Button>)

    const button = screen.getByRole("button", { name: "Commit" })
    fireEvent.click(button)

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(onClick).not.toHaveBeenCalled()
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
    expect(screen.getByRole("button", { name: "Refresh repository" }).getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull())
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
    expect(screen.getByLabelText("Switch to another branch before deleting this branch").getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
  })
})

describe("overflow-only tooltips", () => {
  it("checks the current width on each hover and keeps the target mounted", () => {
    vi.useFakeTimers()
    render(<TooltipProvider><TooltipTarget overflowOnly content="Full branch name"><span>branch</span></TooltipTarget></TooltipProvider>)
    const target = screen.getByText("branch")
    let width = 120
    Object.defineProperties(target, {
      clientWidth: { get: () => width },
      scrollWidth: { get: () => 120 },
    })
    fireEvent.pointerMove(target, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS))
    expect(screen.queryByRole("tooltip")).toBeNull()
    fireEvent.pointerLeave(target, { pointerType: "mouse" })
    width = 60
    fireEvent.pointerMove(target, { pointerType: "mouse" })
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS))
    expect(screen.getByRole("tooltip").textContent).toContain("Full branch name")
    expect(screen.getByText("branch")).toBe(target)
  })

  it("opens on keyboard focus when text is clipped vertically", async () => {
    render(<TooltipProvider><TooltipTarget overflowOnly content="Full title"><button>title</button></TooltipTarget></TooltipProvider>)
    const target = screen.getByRole("button")
    Object.defineProperties(target, { clientHeight: { value: 20 }, scrollHeight: { value: 40 } })
    fireEvent.focus(target)
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toContain("Full title"))
    expect(target.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
  })
})
