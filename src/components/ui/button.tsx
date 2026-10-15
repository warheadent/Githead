import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-[120ms] ease-(--ease-out) outline-none [@media(hover:hover)_and_(pointer:fine)]:enabled:active:[transform:scale(0.98)] motion-reduce:transition-opacity! motion-reduce:duration-[120ms]! motion-reduce:transform-none! [@media(hover:hover)_and_(pointer:fine)]:enabled:active:motion-reduce:opacity-[0.92] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:outline-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:outline-destructive",
        outline:
          "border border-input bg-surface text-foreground hover:bg-hover aria-pressed:bg-selected",
        secondary:
          "border border-input bg-surface text-foreground hover:bg-hover aria-pressed:bg-selected",
        ghost:
          "text-muted-foreground hover:bg-hover hover:text-foreground [&[aria-haspopup][aria-expanded=true]]:bg-hover [&[aria-haspopup][aria-expanded=true]]:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2",
        lg: "h-9 rounded-md px-4 has-[>svg]:px-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-9",
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
