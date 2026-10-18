import { useLayoutEffect, useRef } from "react";
import { QUICK_SWITCHER_ATTRIBUTE } from "./QuickSwitcher";

export interface AppShortcutHandlers {
  /** True while the quick switcher is open. */
  quickSwitcherOpen: boolean;
  /** True when the open repository is valid. New branch (Ctrl/Cmd+B) needs it. */
  workspaceValid: boolean;
  /** Opens the switcher in 'all' mode, or closes it when it is open (Ctrl/Cmd+K). */
  onToggleQuickSwitcher: () => void;
  /** Closes the switcher before another shortcut opens a dialog. */
  onCloseQuickSwitcher: () => void;
  /** Ctrl/Cmd+, */
  onOpenSettings: () => void;
  /** Ctrl/Cmd+B */
  onNewBranch: () => void;
  /** Ctrl/Cmd+O. Like the switcher's "Add or clone repository…" row, it also works from an unavailable repository. */
  onAddRepository: () => void;
}

type ShortcutAction = "quick-switcher" | "settings" | "new-branch" | "add-repository";

/**
 * Registers the workspace keyboard shortcuts with one window keydown listener. A shortcut never opens a dialog over
 * another dialog or menu; the quick switcher is the exception, and it closes before the next dialog opens.
 */
export function useAppShortcuts(enabled: boolean, handlers: AppShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useLayoutEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const action = getShortcutAction(event);
      if (!action) return;

      const current = handlersRef.current;
      if (hasBlockingOverlay()) return;
      if (action === "new-branch" && !current.workspaceValid) return;

      event.preventDefault();
      if (action === "quick-switcher") {
        current.onToggleQuickSwitcher();
        return;
      }

      if (current.quickSwitcherOpen) current.onCloseQuickSwitcher();
      if (action === "settings") current.onOpenSettings();
      else if (action === "new-branch") current.onNewBranch();
      else current.onAddRepository();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

function getShortcutAction(event: KeyboardEvent): ShortcutAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return null;
  switch (event.key.toLowerCase()) {
    case "k":
      return "quick-switcher";
    case ",":
      return "settings";
    case "b":
      return "new-branch";
    case "o":
      return "add-repository";
    default:
      return null;
  }
}

/** A dialog, popover or menu other than the quick switcher is open. */
function hasBlockingOverlay(): boolean {
  return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"]'))
    .some((element) => !element.hasAttribute(QUICK_SWITCHER_ATTRIBUTE));
}

export type ZoomShortcutAction = "zoom-in" | "zoom-out" | "zoom-reset";

/**
 * Registers Ctrl/Cmd+Plus, Ctrl/Cmd+Minus and Ctrl/Cmd+0. Unlike the workspace shortcuts, zoom works on every route and
 * over open dialogs because it does not change focus or open anything.
 */
export function useZoomShortcuts(onZoom: (action: ZoomShortcutAction) => void): void {
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;

  useLayoutEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return;
      const action = getZoomShortcutAction(event);
      if (!action) return;
      event.preventDefault();
      onZoomRef.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function getZoomShortcutAction(event: KeyboardEvent): ZoomShortcutAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key) {
    case "=":
    case "+":
      return "zoom-in";
    case "-":
    case "_":
      return "zoom-out";
    case "0":
      return event.shiftKey ? null : "zoom-reset";
    default:
      return null;
  }
}
