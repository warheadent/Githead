import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// The V2 segmented control. Tabs (default variant) reuse the same track and segment styles.
const segmentedTrackClassName =
  "inline-flex w-fit items-center gap-0.5 rounded-md bg-muted p-0.5 text-muted-foreground"

const segmentedItemVariants = cva(
  "relative inline-flex select-none items-center justify-center gap-1.5 rounded-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-[color,background-color,box-shadow] duration-[120ms] ease-(--ease-out) hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_0_1px_var(--border)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default: "h-7 px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        sm: "h-6 px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

type SegmentedSize = "default" | "sm"

interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  ariaLabel?: string
  disabled?: boolean
  title?: string
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "default",
  className,
}: {
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  size?: SegmentedSize
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      data-size={size}
      className={cn(segmentedTrackClassName, className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            data-slot="segmented-item"
            data-state={selected ? "active" : "inactive"}
            aria-pressed={selected}
            aria-label={option.ariaLabel}
            title={option.title}
            disabled={option.disabled}
            className={segmentedItemVariants({ size })}
            onClick={() => {
              if (!selected) onChange(option.value)
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export { Segmented, segmentedItemVariants, segmentedTrackClassName, type SegmentedOption }
