import { useCallback, useEffect, useRef, useState, type PointerEventHandler, type RefObject } from "react";

export function selectionIntersectsElement(selection: Selection | null, element: Node): boolean {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  if (selection.anchorNode && element.contains(selection.anchorNode)) return true;
  if (selection.focusNode && element.contains(selection.focusNode)) return true;

  try {
    return selection.getRangeAt(0).intersectsNode(element);
  } catch {
    return false;
  }
}

interface SelectionSafeValue<T> {
  value: T;
  requestValue: (value: T) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  onPointerDownCapture: PointerEventHandler<HTMLDivElement>;
}

/**
 * Defers DOM-changing values while a pointer selection is active or remains
 * inside the root. The latest requested value is applied after selection ends.
 */
export function useSelectionSafeValue<T>(initialValue: T): SelectionSafeValue<T> {
  const [value, setValue] = useState(initialValue);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerSelectingRef = useRef(false);
  const pendingValueRef = useRef<{ value: T } | null>(null);

  const selectionBlocksUpdate = useCallback((): boolean => {
    const root = rootRef.current;
    if (pointerSelectingRef.current || !root) return pointerSelectingRef.current;
    return selectionIntersectsElement(root.ownerDocument.getSelection(), root);
  }, []);

  const applyPendingValue = useCallback((): void => {
    if (!pendingValueRef.current || selectionBlocksUpdate()) return;
    const pending = pendingValueRef.current;
    pendingValueRef.current = null;
    setValue(pending.value);
  }, [selectionBlocksUpdate]);

  const requestValue = useCallback((nextValue: T): void => {
    if (selectionBlocksUpdate()) {
      pendingValueRef.current = { value: nextValue };
      return;
    }

    pendingValueRef.current = null;
    setValue(nextValue);
  }, [selectionBlocksUpdate]);

  const onPointerDownCapture = useCallback<PointerEventHandler<HTMLDivElement>>(() => {
    pointerSelectingRef.current = true;
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const ownerDocument = root?.ownerDocument;
    if (!ownerDocument) return;

    const handlePointerUp = (): void => {
      pointerSelectingRef.current = false;
      applyPendingValue();
    };

    ownerDocument.addEventListener("pointerup", handlePointerUp);
    ownerDocument.addEventListener("pointercancel", handlePointerUp);
    ownerDocument.addEventListener("selectionchange", applyPendingValue);
    return () => {
      ownerDocument.removeEventListener("pointerup", handlePointerUp);
      ownerDocument.removeEventListener("pointercancel", handlePointerUp);
      ownerDocument.removeEventListener("selectionchange", applyPendingValue);
    };
  }, [applyPendingValue]);

  return { value, requestValue, rootRef, onPointerDownCapture };
}
