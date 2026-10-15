// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { Segmented } from "./segmented"

afterEach(() => {
  cleanup()
})

const RANGE_OPTIONS = [
  { value: "d90", label: "90 days" },
  { value: "y1", label: "12 months" },
  { value: "all", label: "All time", ariaLabel: "All history", title: "Every commit" },
] as const

describe("Segmented", () => {
  it("exposes a labelled group of pressed-state buttons", () => {
    render(<Segmented label="Date range" options={RANGE_OPTIONS} value="y1" onChange={() => {}} />)

    const group = screen.getByRole("group", { name: "Date range" })
    const buttons = within(group).getAllByRole("button")

    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"])
    expect(within(group).getByRole("button", { name: "12 months" }).getAttribute("data-state")).toBe("active")
    expect(within(group).getByRole("button", { name: "All history" }).getAttribute("title")).toBe("Every commit")
  })

  it("reports a new value and ignores the current one", () => {
    const onChange = vi.fn()
    render(<Segmented label="Date range" options={RANGE_OPTIONS} value="y1" onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "12 months" }))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "90 days" }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith("d90")
  })

  it("keeps disabled options inert", () => {
    const onChange = vi.fn()
    render(
      <Segmented
        label="Mode"
        options={[{ value: "a", label: "A" }, { value: "b", label: "B", disabled: true }]}
        value="a"
        onChange={onChange}
      />
    )

    const disabled = screen.getByRole("button", { name: "B" }) as HTMLButtonElement
    expect(disabled.disabled).toBe(true)
    fireEvent.click(disabled)
    expect(onChange).not.toHaveBeenCalled()
  })
})
