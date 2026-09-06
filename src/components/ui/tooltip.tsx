"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const TOOLTIP_DELAY_MS = 750

function TooltipProvider({
  delayDuration = TOOLTIP_DELAY_MS,
  skipDelayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

function Tooltip({
  delayDuration = TOOLTIP_DELAY_MS,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" delayDuration={delayDuration} {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "max-w-[min(var(--tooltip-max-width,24rem),calc(100vw-1rem),var(--radix-tooltip-content-available-width))] whitespace-normal [overflow-wrap:anywhere]",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

function TooltipTarget({
  children,
  content,
  contentProps,
  overflowOnly = false,
}: {
  children: React.ReactElement
  content: React.ReactNode
  contentProps?: Omit<React.ComponentProps<typeof TooltipContent>, "children">
  overflowOnly?: boolean
}) {
  const targetRef = React.useRef<HTMLElement>(null)
  const [open, setOpen] = React.useState(false)
  const hasOverflow = React.useCallback(() => {
    const target = targetRef.current
    return Boolean(target && (target.scrollWidth > target.clientWidth || target.scrollHeight > target.clientHeight))
  }, [])

  React.useEffect(() => {
    if (!overflowOnly || !open) return
    const target = targetRef.current
    if (!target) return
    const closeIfVisible = () => {
      if (!hasOverflow()) setOpen(false)
    }
    closeIfVisible()
    const observer = new ResizeObserver(closeIfVisible)
    observer.observe(target)
    return () => observer.disconnect()
  }, [content, hasOverflow, open, overflowOnly])

  if (content === null || content === undefined || content === "") {
    return children
  }

  return (
    <Tooltip open={open} onOpenChange={(nextOpen) => setOpen(nextOpen && (!overflowOnly || hasOverflow()))}>
      <TooltipTrigger asChild ref={(node) => { targetRef.current = node }}>{children}</TooltipTrigger>
      <TooltipContent {...contentProps}>{content}</TooltipContent>
    </Tooltip>
  )
}

export { TOOLTIP_DELAY_MS, Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipTarget }
