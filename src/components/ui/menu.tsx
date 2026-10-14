import * as React from "react"

import { cn } from "@/lib/utils"

// Shared V2 menu styling. Dropdown and context menus compose these so both stay identical.
const menuContentClassName =
  "z-50 min-w-[8rem] overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1.5 text-popover-foreground shadow-(--shadow-overlay) duration-[180ms] ease-(--ease-out) data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"

const menuItemClassName =
  "relative flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-hover focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const menuActionItemClassName = cn(
  menuItemClassName,
  "data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!"
)

const menuSelectableItemClassName = cn(menuItemClassName, "pl-8")

const menuSubTriggerClassName = cn(
  menuItemClassName,
  "data-[inset]:pl-8 data-[state=open]:bg-hover data-[state=open]:text-foreground [&_svg:not([class*='text-'])]:text-muted-foreground"
)

const menuLabelClassName =
  "px-2 py-1.5 text-xs leading-4 font-medium tracking-[.02em] text-muted-foreground data-[inset]:pl-8"

const menuSeparatorClassName = "-mx-1.5 my-1.5 h-px bg-border"

const menuShortcutClassName =
  "ml-auto inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm bg-muted px-1 text-xs leading-none tabular-nums font-medium text-muted-foreground"

/**
 * Secondary text for a menu item. Give the item aria-label={label} and aria-describedby={id}
 * so its accessible name stays exactly the label.
 */
function MenuItemDescription({
  className,
  ...props
}: React.ComponentProps<"span"> & { id: string }) {
  return (
    <span
      data-slot="menu-item-description"
      className={cn("block text-xs leading-4 text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  MenuItemDescription,
  menuActionItemClassName,
  menuContentClassName,
  menuLabelClassName,
  menuSelectableItemClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
  menuSubTriggerClassName,
}
