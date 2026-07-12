import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { IMAGE_PREVIEW_LIMIT, imageVersionFromBytes, type ImageReadResult } from "./imageDiff";

const POINTER_VERSION = "version https://git-lfs.github.com/spec/v1";

export interface GitLfsPointer { oid: string; size: number }

export function parseGitLfsPointer(data: Uint8Array): GitLfsPointer | null {
  if (data.byteLength === 0 || data.byteLength > 1024) return null;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { return null; }
  if ([...text].some((character) => {
    const code = character.charCodeAt(0);
    return code !== 9 && code !== 10 && (code < 32 || code > 126);
  })) return null;
  if (!text.endsWith("\n")) return null;
  const lines = text.slice(0, -1).split("\n");
  if (lines[0] !== POINTER_VERSION) return null;
  let oid: string | null = null;
  let size: number | null = null;
  let previousKey = "";
  for (const line of lines.slice(1)) {
    const match = /^(?<key>[a-z0-9.-]+) (?<value>[^\r\n]+)$/.exec(line);
    if (!match?.groups) return null;
    const key = match.groups.key!;
    const value = match.groups.value!;
    if (key <= previousKey) return null;
    previousKey = key;
    if (key === "oid") {
      if (oid || !/^sha256:[0-9a-f]{64}$/.test(value)) return null;
      oid = value.slice(7);
    } else if (key === "size") {
      if (size !== null || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed)) return null;
      size = parsed;
    }
  }
  return oid && size !== null ? { oid, size } : null;
}

export function isGitLfsPointerDiff(text: string): boolean {
  return /^[ +-]version https:\/\/git-lfs\.github\.com\/spec\/v1$/m.test(text)
    && /^[+-]oid sha256:[0-9a-f]{64}$/m.test(text)
    && /^[+-]size (0|[1-9][0-9]*)$/m.test(text);
}

export function parseLocalMediaDir(text: string): string | null {
  const line = text.split(/\r?\n/).find((value) => value.startsWith("LocalMediaDir="));
  return line?.slice("LocalMediaDir=".length).trim() || null;
}

export async function resolveLocalLfsImage(mediaDir: string, pointer: GitLfsPointer, filePath: string, fetchable: boolean): Promise<ImageReadResult> {
  if (pointer.size > IMAGE_PREVIEW_LIMIT) return { kind: "oversized" };
  const objectPath = path.join(mediaDir, pointer.oid.slice(0, 2), pointer.oid.slice(2, 4), pointer.oid);
  try {
    const stat = await fs.stat(objectPath);
    if (!stat.isFile() || stat.size !== pointer.size) return { kind: "error" };
    const bytes = await fs.readFile(objectPath);
    if (createHash("sha256").update(bytes).digest("hex") !== pointer.oid) return { kind: "error" };
    return imageVersionFromBytes(filePath, bytes);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "lfs-missing", byteLength: pointer.size, fetchable }
      : { kind: "error" };
  }
}

export function escapeLfsIncludePath(filePath: string): string | null {
  if (filePath.includes(",") || [...filePath].some((character) => character.charCodeAt(0) < 32)) return null;
  return filePath.replace(/([\\*?[\]])/g, "\\$1").replace(/^([!#])/, "\\$1");
}
