import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { WorkspaceTrustApi } from "../shared/types";

const api: WorkspaceTrustApi = {
  respond: (response) => {
    ipcRenderer.send(IPC_CHANNELS.workspaceTrustResponse, response);
  }
};

contextBridge.exposeInMainWorld("workspaceTrust", api);
