// Run with `vp run icons:generate`. Linux requires a display, or xvfb-run.
// SVG is the source; Electron rasterizes it without another image dependency.
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

async function generateIcons() {
  const resources = fileURLToPath(new URL("../resources/", import.meta.url));
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "githead-icons-"));
  app.setPath("userData", profile);

  try {
    await app.whenReady();
    const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await window.loadURL("data:text/html,<meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; img-src data:\"> ");
    const svg = await fs.readFile(path.join(resources, "icon.svg"), "utf8");
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
    const encoded = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      await image.decode();
      return ${JSON.stringify(sizes)}.map(size => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    })()`);
    const images = encoded.map((data) => Buffer.from(data, "base64"));
    await fs.writeFile(path.join(resources, "icon.png"), images.at(-1));

    // ICO directory followed by PNG frames. A size byte of zero represents 256.
    const frames = images.slice(0, -1);
    const directory = Buffer.alloc(6 + frames.length * 16);
    directory.writeUInt16LE(1, 2);
    directory.writeUInt16LE(frames.length, 4);
    let offset = directory.length;
    frames.forEach((frame, index) => {
      const entry = 6 + index * 16;
      directory[entry] = directory[entry + 1] = sizes[index] % 256;
      directory.writeUInt16LE(1, entry + 4);
      directory.writeUInt16LE(32, entry + 6);
      directory.writeUInt32LE(frame.length, entry + 8);
      directory.writeUInt32LE(offset, entry + 12);
      offset += frame.length;
    });
    await fs.writeFile(path.join(resources, "icon.ico"), Buffer.concat([directory, ...frames]));
    window.destroy();
    console.log("Generated resources/icon.png and resources/icon.ico from icon.svg");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => undefined);
    app.exit(process.exitCode ?? 0);
  }
}

void generateIcons();
