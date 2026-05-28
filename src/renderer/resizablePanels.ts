type ResizeAxis = "x" | "y";

interface ResizablePanelConfig {
  id: string;
  container: HTMLElement;
  handle: HTMLElement;
  axis: ResizeAxis;
  cssVariable: string;
  label: string;
  defaultSize: number;
  minSize: number;
  minRemainder: number;
  disabledQuery?: string;
}

interface StoredPanelSizes {
  [id: string]: number;
}

interface ResizablePanel {
  refresh(): void;
}

const STORAGE_KEY = "githead:panel-layout:v1";
const HANDLE_SIZE = 8;
const KEYBOARD_STEP = 24;

export function initializeResizablePanels(configs: ResizablePanelConfig[]): ResizablePanel {
  const storedSizes = readStoredSizes();
  const panels = configs.map((config) => createResizablePanel(config, storedSizes));

  const refresh = (): void => {
    panels.forEach((panel) => panel.refresh());
  };

  window.addEventListener("resize", refresh);
  return {
    refresh
  };
}

function createResizablePanel(config: ResizablePanelConfig, storedSizes: StoredPanelSizes): ResizablePanel {
  let currentSize = storedSizes[config.id] ?? config.defaultSize;
  let pointerStart = 0;
  let sizeStart = 0;
  let dragging = false;
  const disabledMedia = config.disabledQuery ? window.matchMedia(config.disabledQuery) : null;
  const resizeObserver = new ResizeObserver(() => {
    refresh();
  });

  config.handle.setAttribute("role", "separator");
  config.handle.setAttribute("aria-label", config.label);
  config.handle.setAttribute("aria-orientation", config.axis === "x" ? "vertical" : "horizontal");
  config.handle.tabIndex = 0;

  config.handle.addEventListener("pointerdown", (event) => {
    if (isDisabled()) {
      return;
    }

    event.preventDefault();
    dragging = true;
    pointerStart = getPointerPosition(event, config.axis);
    sizeStart = currentSize;
    config.handle.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing-panel");
    document.body.classList.add(config.axis === "x" ? "is-resizing-panel-x" : "is-resizing-panel-y");
    config.handle.classList.add("is-dragging");
  });

  config.handle.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }

    const delta = getPointerPosition(event, config.axis) - pointerStart;
    applySize(sizeStart + delta, false);
  });

  config.handle.addEventListener("pointerup", (event) => {
    if (!dragging) {
      return;
    }

    dragging = false;
    config.handle.releasePointerCapture(event.pointerId);
    document.body.classList.remove("is-resizing-panel");
    document.body.classList.remove("is-resizing-panel-x", "is-resizing-panel-y");
    config.handle.classList.remove("is-dragging");
    persistSize(config.id, currentSize);
  });

  config.handle.addEventListener("pointercancel", () => {
    if (!dragging) {
      return;
    }

    dragging = false;
    document.body.classList.remove("is-resizing-panel");
    document.body.classList.remove("is-resizing-panel-x", "is-resizing-panel-y");
    config.handle.classList.remove("is-dragging");
    applySize(sizeStart, false);
  });

  config.handle.addEventListener("keydown", (event) => {
    if (isDisabled()) {
      return;
    }

    const direction = getKeyboardDirection(event, config.axis);
    if (direction === 0 && event.key !== "Home" && event.key !== "End") {
      return;
    }

    event.preventDefault();
    if (event.key === "Home") {
      applySize(config.minSize, true);
    } else if (event.key === "End") {
      applySize(getMaxSize(), true);
    } else {
      applySize(currentSize + direction * KEYBOARD_STEP, true);
    }
  });

  disabledMedia?.addEventListener("change", refresh);
  resizeObserver.observe(config.container);
  refresh();

  function refresh(): void {
    const disabled = isDisabled();
    config.handle.toggleAttribute("aria-disabled", disabled);
    config.handle.tabIndex = disabled ? -1 : 0;

    if (disabled) {
      config.container.style.removeProperty(config.cssVariable);
      return;
    }

    applySize(currentSize, false);
  }

  function applySize(nextSize: number, shouldPersist: boolean): void {
    if (isDisabled()) {
      return;
    }

    const maxSize = getMaxSize();
    if (maxSize <= config.minSize) {
      return;
    }

    currentSize = clamp(nextSize, config.minSize, maxSize);
    config.container.style.setProperty(config.cssVariable, `${currentSize}px`);
    config.handle.setAttribute("aria-valuemin", String(config.minSize));
    config.handle.setAttribute("aria-valuemax", String(maxSize));
    config.handle.setAttribute("aria-valuenow", String(Math.round(currentSize)));

    if (shouldPersist) {
      persistSize(config.id, currentSize);
    }
  }

  function getMaxSize(): number {
    const size = config.axis === "x" ? config.container.clientWidth : config.container.clientHeight;
    return Math.max(config.minSize, size - config.minRemainder - HANDLE_SIZE);
  }

  function isDisabled(): boolean {
    return disabledMedia?.matches ?? false;
  }

  return {
    refresh
  };
}

function getPointerPosition(event: PointerEvent, axis: ResizeAxis): number {
  return axis === "x" ? event.clientX : event.clientY;
}

function getKeyboardDirection(event: KeyboardEvent, axis: ResizeAxis): number {
  if (axis === "x") {
    if (event.key === "ArrowLeft") {
      return -1;
    }
    if (event.key === "ArrowRight") {
      return 1;
    }
  }

  if (axis === "y") {
    if (event.key === "ArrowUp") {
      return -1;
    }
    if (event.key === "ArrowDown") {
      return 1;
    }
  }

  return 0;
}

function readStoredSizes(): StoredPanelSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
    );
  } catch {
    return {};
  }
}

function persistSize(id: string, size: number): void {
  const sizes = readStoredSizes();
  sizes[id] = Math.round(size);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Persistence is best-effort; dragging should keep working when storage is unavailable.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
