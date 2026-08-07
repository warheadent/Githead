import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  type UIEvent
} from "react";
import { TabsContent } from "@/components/ui/tabs";

const WORKSPACE_NAMESPACE_LIMIT = 8;

interface ScrollPosition {
  top: number;
  left: number;
}

interface WorkspaceNamespaceState {
  readonly values: Map<string, unknown>;
  readonly scrollPositions: Map<string, ScrollPosition>;
}

export class WorkspacePanelStateStore {
  private readonly namespaces = new Map<string, WorkspaceNamespaceState>();
  private readonly listeners = new Map<string, Set<() => void>>();

  read<T>(namespace: string, key: string, initialValue: T | (() => T)): T {
    const state = this.getNamespace(namespace);
    if (state.values.has(key)) return state.values.get(key) as T;
    const value = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    state.values.set(key, value);
    return value;
  }

  write<T>(namespace: string, key: string, value: T): void {
    const values = this.getNamespace(namespace).values;
    if (Object.is(values.get(key), value)) return;
    values.set(key, value);
    for (const listener of this.listeners.get(valueListenerKey(namespace, key)) ?? []) listener();
  }

  subscribe(namespace: string, key: string, listener: () => void): () => void {
    const listenerKey = valueListenerKey(namespace, key);
    let listeners = this.listeners.get(listenerKey);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(listenerKey, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(listenerKey);
    };
  }

  readScrollPosition(namespace: string, panelKey: string, scrollKey: string): ScrollPosition | null {
    return this.getNamespace(namespace).scrollPositions.get(`${panelKey}:${scrollKey}`) ?? null;
  }

  writeScrollPosition(namespace: string, panelKey: string, scrollKey: string, position: ScrollPosition): void {
    this.getNamespace(namespace).scrollPositions.set(`${panelKey}:${scrollKey}`, position);
  }

  private getNamespace(namespace: string): WorkspaceNamespaceState {
    const current = this.namespaces.get(namespace);
    if (current) {
      this.namespaces.delete(namespace);
      this.namespaces.set(namespace, current);
      return current;
    }

    const created: WorkspaceNamespaceState = {
      values: new Map(),
      scrollPositions: new Map()
    };
    this.namespaces.set(namespace, created);
    while (this.namespaces.size > WORKSPACE_NAMESPACE_LIMIT) {
      const oldest = this.namespaces.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.namespaces.delete(oldest);
    }
    return created;
  }
}

const WorkspacePanelStateContext = createContext<{
  store: WorkspacePanelStateStore;
  namespace: string;
} | null>(null);

export function WorkspacePanelStateProvider({
  store,
  namespace,
  children
}: {
  store: WorkspacePanelStateStore;
  namespace: string;
  children: ReactNode;
}): ReactNode {
  const value = useMemo(() => ({ store, namespace }), [namespace, store]);
  return (
    <WorkspacePanelStateContext.Provider value={value}>
      {children}
    </WorkspacePanelStateContext.Provider>
  );
}

export function usePersistentWorkspacePanelState<T>(
  key: string,
  initialValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(WorkspacePanelStateContext);
  const fallbackNamespace = useId();
  const fallbackStoreRef = useRef<WorkspacePanelStateStore | null>(null);
  fallbackStoreRef.current ??= new WorkspacePanelStateStore();
  const store = context?.store ?? fallbackStoreRef.current;
  const namespace = context?.namespace ?? fallbackNamespace;
  const initialValueRef = useRef(initialValue);
  store.read(namespace, key, initialValueRef.current);
  const value = useSyncExternalStore(
    useCallback((listener) => store.subscribe(namespace, key, listener), [key, namespace, store]),
    useCallback(() => store.read(namespace, key, initialValueRef.current), [key, namespace, store]),
    useCallback(() => store.read(namespace, key, initialValueRef.current), [key, namespace, store])
  );
  const setValue = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    const current = store.read(namespace, key, initialValueRef.current);
    const next = typeof action === "function"
      ? (action as (current: T) => T)(current)
      : action;
    store.write(namespace, key, next);
  }, [key, namespace, store]);

  return [value, setValue];
}

export function PersistentWorkspaceTabsContent({
  panelKey,
  active,
  preserveMount = false,
  forceMount,
  onScrollCapture,
  ...props
}: ComponentProps<typeof TabsContent> & {
  panelKey: string;
  active: boolean;
  preserveMount?: boolean;
}): ReactNode {
  const context = useContext(WorkspacePanelStateContext);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wasActiveRef = useRef(active);
  if (active) wasActiveRef.current = true;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!active || !context || !root) return;

    const frameId = requestAnimationFrame(() => {
      const candidates = [root, ...root.querySelectorAll<HTMLElement>("[data-workspace-scroll-key], [role][aria-label]")];
      for (const candidate of candidates) {
        const scrollKey = getScrollKey(candidate);
        if (!scrollKey) continue;
        const position = context.store.readScrollPosition(context.namespace, panelKey, scrollKey);
        if (!position) continue;
        candidate.scrollTop = position.top;
        candidate.scrollLeft = position.left;
        candidate.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    });
    return () => {
      cancelAnimationFrame(frameId);
      const candidates = [root, ...root.querySelectorAll<HTMLElement>("[data-workspace-scroll-key], [role][aria-label]")];
      for (const candidate of candidates) {
        const scrollKey = getScrollKey(candidate);
        if (!scrollKey) continue;
        context.store.writeScrollPosition(context.namespace, panelKey, scrollKey, {
          top: candidate.scrollTop,
          left: candidate.scrollLeft
        });
      }
    };
  }, [active, context, panelKey]);

  const handleScrollCapture = useCallback((event: UIEvent<HTMLDivElement>) => {
    onScrollCapture?.(event);
    if (!context || !(event.target instanceof HTMLElement)) return;
    const scrollKey = getScrollKey(event.target);
    if (!scrollKey) return;
    context.store.writeScrollPosition(context.namespace, panelKey, scrollKey, {
      top: event.target.scrollTop,
      left: event.target.scrollLeft
    });
  }, [context, onScrollCapture, panelKey]);

  return (
    <TabsContent
      ref={rootRef}
      onScrollCapture={handleScrollCapture}
      {...(forceMount === true || (preserveMount && wasActiveRef.current) ? { forceMount: true as const } : {})}
      {...props}
    />
  );
}

function getScrollKey(element: HTMLElement): string | null {
  const explicitKey = element.dataset.workspaceScrollKey;
  if (explicitKey) return `key:${explicitKey}`;
  const role = element.getAttribute("role");
  const label = element.getAttribute("aria-label");
  return role && label ? `role:${role}:${label}` : null;
}

function valueListenerKey(namespace: string, key: string): string {
  return `${namespace}\0${key}`;
}
