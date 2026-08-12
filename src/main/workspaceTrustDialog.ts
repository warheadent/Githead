import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import path from "node:path";
import { IPC_CHANNELS } from "../shared/ipc";
import type { WorkspaceTrustDialogContext, WorkspaceTrustResponse } from "../shared/types";

const DIALOG_WIDTH = 540;
const DIALOG_HEIGHT = 362;

export interface ShowWorkspaceTrustDialogOptions {
  parent: BrowserWindow | null;
  context: WorkspaceTrustDialogContext;
  devServerUrl?: string;
}

export function showWorkspaceTrustDialog(options: ShowWorkspaceTrustDialogOptions): Promise<boolean> {
  const parent = options.parent && !options.parent.isDestroyed() ? options.parent : null;
  const width = Math.round(DIALOG_WIDTH * options.context.zoomFactor);
  const height = Math.round(DIALOG_HEIGHT * options.context.zoomFactor);
  const position = getDialogPosition(parent, width, height);
  const trustWindow = new BrowserWindow({
    width,
    height,
    ...position,
    ...(parent ? { parent } : {}),
    modal: Boolean(parent),
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    title: "Confirm Workspace Trust",
    backgroundColor: getDialogBackground(options.context.appearanceMode),
    webPreferences: {
      preload: path.join(__dirname, "workspace-trust-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  trustWindow.setMenuBarVisibility(false);
  trustWindow.webContents.setZoomFactor(options.context.zoomFactor);
  trustWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  trustWindow.webContents.on("will-navigate", (event) => event.preventDefault());

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (trusted: boolean): void => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener(IPC_CHANNELS.workspaceTrustResponse, handleResponse);
      resolve(trusted);
      if (!trustWindow.isDestroyed()) trustWindow.close();
    };
    const handleResponse = (
      event: Electron.IpcMainEvent,
      response: WorkspaceTrustResponse
    ): void => {
      if (event.sender !== trustWindow.webContents) return;
      finish(response === "trust");
    };

    ipcMain.on(IPC_CHANNELS.workspaceTrustResponse, handleResponse);
    trustWindow.once("ready-to-show", () => trustWindow.show());
    trustWindow.once("closed", () => finish(false));
    trustWindow.webContents.on("before-input-event", (_event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") finish(false);
    });

    const query = createDialogQuery(options.context);
    const load = options.devServerUrl
      ? trustWindow.loadURL(createDevDialogUrl(options.devServerUrl, query))
      : trustWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "workspace-trust.html"), { query });
    void load.catch(() => finish(false));
  });
}

function getDialogPosition(parent: BrowserWindow | null, width: number, height: number): { x?: number; y?: number } {
  if (!parent) return {};
  const bounds = parent.getBounds();
  return {
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + (bounds.height - height) / 2)
  };
}

function createDialogQuery(context: WorkspaceTrustDialogContext): Record<string, string> {
  return {
    repoPath: context.repoPath,
    appearanceMode: context.appearanceMode,
    colorTheme: context.colorTheme,
    uiFont: context.uiFont,
    codeFont: context.codeFont,
    zoomFactor: String(context.zoomFactor)
  };
}

function createDevDialogUrl(devServerUrl: string, query: Record<string, string>): string {
  const url = new URL("workspace-trust.html", devServerUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.href;
}

function getDialogBackground(appearanceMode: WorkspaceTrustDialogContext["appearanceMode"]): string {
  const dark = appearanceMode === "dark" || (appearanceMode === "system" && nativeTheme.shouldUseDarkColors);
  return dark ? "#20242b" : "#ffffff";
}
