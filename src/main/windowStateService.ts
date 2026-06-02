import * as fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Rectangle } from "electron";

export const DEFAULT_WINDOW_BOUNDS = {
  width: 1120,
  height: 760
} as const;

export const MIN_WINDOW_BOUNDS = {
  width: 860,
  height: 620
} as const;

const WINDOW_STATE_FILE = "window-state.json";
const SAVE_DELAY_MS = 500;
const MIN_VISIBLE_WIDTH = 80;
const MIN_VISIBLE_HEIGHT = 80;

export interface RestoredWindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface RestoredWindowState {
  bounds: RestoredWindowBounds;
  isMaximized: boolean;
}

export interface StoredWindowState extends Rectangle {
  isMaximized?: boolean;
}

interface WindowStateTarget {
  getBounds(): Rectangle;
  getNormalBounds(): Rectangle;
  isFullScreen(): boolean;
  isMaximized(): boolean;
  isMinimized(): boolean;
}

type WindowStateEvent =
  | "resize"
  | "move"
  | "maximize"
  | "unmaximize"
  | "enter-full-screen"
  | "leave-full-screen"
  | "close";

interface WindowStateWindow extends WindowStateTarget {
  on(event: WindowStateEvent, listener: () => void): this;
  removeListener(event: WindowStateEvent, listener: () => void): this;
}

type PositionedWindowBounds = Required<RestoredWindowBounds>;

export class WindowStateService {
  private readonly statePath: string;
  private readonly saveDelayMs: number;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(
    userDataPath: string,
    options: { saveDelayMs?: number } = {}
  ) {
    this.statePath = path.join(userDataPath, WINDOW_STATE_FILE);
    this.saveDelayMs = options.saveDelayMs ?? SAVE_DELAY_MS;
  }

  async getWindowState(workAreas: readonly Rectangle[]): Promise<RestoredWindowState> {
    try {
      return restoreWindowState(await this.readStoredState(), workAreas);
    } catch {
      return restoreWindowState(null, workAreas);
    }
  }

  watchWindow(window: WindowStateWindow): () => void {
    const scheduleSave = () => {
      this.scheduleSave(window);
    };
    const saveNow = () => {
      this.clearPendingSave();
      this.saveWindowStateNow(window);
    };

    window.on("resize", scheduleSave);
    window.on("move", scheduleSave);
    window.on("maximize", scheduleSave);
    window.on("unmaximize", scheduleSave);
    window.on("enter-full-screen", scheduleSave);
    window.on("leave-full-screen", scheduleSave);
    window.on("close", saveNow);

    return () => {
      window.removeListener("resize", scheduleSave);
      window.removeListener("move", scheduleSave);
      window.removeListener("maximize", scheduleSave);
      window.removeListener("unmaximize", scheduleSave);
      window.removeListener("enter-full-screen", scheduleSave);
      window.removeListener("leave-full-screen", scheduleSave);
      window.removeListener("close", saveNow);
      this.clearPendingSave();
    };
  }

  saveWindowStateNow(window: WindowStateTarget): boolean {
    const state = getPersistableWindowState(window);
    if (!state) {
      return false;
    }

    try {
      fsSync.mkdirSync(path.dirname(this.statePath), {
        recursive: true
      });
      fsSync.writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  private scheduleSave(window: WindowStateTarget): void {
    this.clearPendingSave();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveWindowStateNow(window);
    }, this.saveDelayMs);
    this.saveTimer.unref?.();
  }

  private clearPendingSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private async readStoredState(): Promise<StoredWindowState | null> {
    try {
      const text = await fs.readFile(this.statePath, "utf8");
      return parseStoredWindowState(JSON.parse(text));
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return null;
      }

      if (error instanceof SyntaxError) {
        return null;
      }

      throw error;
    }
  }
}

export function restoreWindowState(
  stored: StoredWindowState | null,
  workAreas: readonly Rectangle[]
): RestoredWindowState {
  if (!stored) {
    return getDefaultWindowState(workAreas);
  }

  const fallbackBounds = getClampedWindowSize(stored, workAreas[0]);
  const workArea = getBestVisibleWorkArea(stored, workAreas);
  if (!workArea) {
    return {
      bounds: fallbackBounds,
      isMaximized: stored.isMaximized === true
    };
  }

  const bounds = clampToWorkArea(stored, workArea);
  return {
    bounds,
    isMaximized: stored.isMaximized === true
  };
}

function getDefaultWindowState(workAreas: readonly Rectangle[]): RestoredWindowState {
  return {
    bounds: getClampedWindowSize(DEFAULT_WINDOW_BOUNDS, workAreas[0]),
    isMaximized: false
  };
}

function getPersistableWindowState(window: WindowStateTarget): StoredWindowState | null {
  const bounds = window.isMaximized() || window.isMinimized() || window.isFullScreen()
    ? window.getNormalBounds()
    : window.getBounds();

  return parseStoredWindowState({
    ...bounds,
    isMaximized: window.isMaximized() && !window.isFullScreen()
  });
}

function parseStoredWindowState(value: unknown): StoredWindowState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Record<string, unknown>;
  const x = parseCoordinate(state.x);
  const y = parseCoordinate(state.y);
  const width = parseDimension(state.width);
  const height = parseDimension(state.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
    isMaximized: state.isMaximized === true
  };
}

function parseCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

function parseDimension(value: unknown): number | null {
  const dimension = parseCoordinate(value);
  return dimension && dimension > 0 ? dimension : null;
}

function getClampedWindowSize(
  bounds: Pick<Rectangle, "width" | "height">,
  workArea: Rectangle | undefined
): RestoredWindowBounds {
  return {
    width: clampDimension(bounds.width, MIN_WINDOW_BOUNDS.width, workArea?.width),
    height: clampDimension(bounds.height, MIN_WINDOW_BOUNDS.height, workArea?.height)
  };
}

function clampToWorkArea(bounds: Rectangle, workArea: Rectangle): PositionedWindowBounds {
  const width = clampDimension(bounds.width, MIN_WINDOW_BOUNDS.width, workArea.width);
  const height = clampDimension(bounds.height, MIN_WINDOW_BOUNDS.height, workArea.height);

  return {
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - height),
    width,
    height
  };
}

function clampDimension(value: number, min: number, max: number | undefined): number {
  return clamp(value, min, max ? Math.max(min, max) : Math.max(min, value));
}

function getBestVisibleWorkArea(bounds: Rectangle, workAreas: readonly Rectangle[]): Rectangle | undefined {
  let bestWorkArea: Rectangle | undefined;
  let bestArea = 0;

  for (const workArea of workAreas) {
    const intersection = getIntersection(bounds, workArea);
    const area = intersection.width * intersection.height;
    if (intersection.width >= MIN_VISIBLE_WIDTH && intersection.height >= MIN_VISIBLE_HEIGHT && area > bestArea) {
      bestWorkArea = workArea;
      bestArea = area;
    }
  }

  return bestWorkArea;
}

function getIntersection(first: Rectangle, second: Rectangle): Pick<Rectangle, "width" | "height"> {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);

  return {
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
