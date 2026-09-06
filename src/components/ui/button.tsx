import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-[120ms] ease-[ease] outline-none [@media(hover:hover)_and_(pointer:fine)]:enabled:active:[transform:scale(0.98)] motion-reduce:transition-opacity! motion-reduce:duration-[120ms]! motion-reduce:transform-none! [@media(hover:hover)_and_(pointer:fine)]:enabled:active:motion-reduce:opacity-[0.92] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

type TooltipButtonProps = React.ComponentProps<typeof Button> & {
  tooltip: React.ReactNode
  disabledTooltip?: React.ReactNode
  tooltipContentProps?: Omit<React.ComponentProps<typeof TooltipContent>, "children">
}

function TooltipButton({
  tooltip,
  disabledTooltip,
  tooltipContentProps,
  disabled = false,
  "aria-label": ariaLabel,
  ...props
}: TooltipButtonProps) {
  const content = disabled && disabledTooltip ? disabledTooltip : tooltip

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? <span
          data-slot="tooltip-button-trigger"
          className="inline-flex"
          tabIndex={disabled ? 0 : undefined}
          aria-label={disabled && typeof content === "string" ? content : undefined}
        >
          <Button disabled={disabled} aria-label={ariaLabel} {...props} />
        </span> : <Button aria-label={ariaLabel} {...props} />}
      </TooltipTrigger>
      <TooltipContent {...tooltipContentProps}>{content}</TooltipContent>
    </Tooltip>
  )
}

export { Button, TooltipButton, buttonVariants }
