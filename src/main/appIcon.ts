import { app } from "electron";
import path from "node:path";

export function getAppIconPath(): string {
  return path.join(app.getAppPath(), "resources", process.platform === "win32" ? "icon.ico" : "icon.png");
}
