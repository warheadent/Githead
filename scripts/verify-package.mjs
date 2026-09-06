import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { listPackage } from "@electron/asar";

const MEBIBYTE = 1024 * 1024;

export const PACKAGE_LIMITS = Object.freeze({
  appAsarBytes: 96 * MEBIBYTE,
  unpackedBytes: 450 * MEBIBYTE
});

const REQUIRED_ASAR_ENTRIES = Object.freeze([
  "dist/main/main/main.js",
  "dist/main/main/preload.js",
  "dist/renderer/index.html",
  "resources/icon.png",
  "resources/icon.ico",
  "node_modules/@sentry/electron/package.json",
  "node_modules/electron-updater/package.json",
  "package.json"
]);

const RENDERER_ONLY_DEPENDENCIES = Object.freeze([
  "@fontsource-variable/inter",
  "highlight.js",
  "mermaid",
  "radix-ui",
  "react-dom"
]);

export function normalizeAsarEntry(entry) {
  return entry.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function inspectAsarEntries(entries) {
  const normalizedEntries = new Set(entries.map(normalizeAsarEntry));
  const errors = [];

  for (const requiredEntry of REQUIRED_ASAR_ENTRIES) {
    if (!normalizedEntries.has(requiredEntry)) {
      errors.push(`Missing runtime file: ${requiredEntry}`);
    }
  }

  const packagedSourceMaps = [...normalizedEntries]
    .filter((entry) => entry.endsWith(".map"))
    .sort();
  if (packagedSourceMaps.length > 0) {
    errors.push(`Packaged source maps: ${packagedSourceMaps.join(", ")}`);
  }

  for (const dependency of RENDERER_ONLY_DEPENDENCIES) {
    if (normalizedEntries.has(`node_modules/${dependency}/package.json`)) {
      errors.push(`Packaged renderer-only dependency: ${dependency}`);
    }
  }

  return errors;
}

export function inspectLocaleFiles(localeFiles) {
  const unexpectedLocales = localeFiles
    .filter((fileName) => fileName !== "en-US.pak")
    .sort();

  if (!localeFiles.includes("en-US.pak")) {
    return ["Missing Electron locale: en-US.pak"];
  }

  return unexpectedLocales.length > 0
    ? [`Unexpected Electron locales: ${unexpectedLocales.join(", ")}`]
    : [];
}

async function directorySize(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  let totalBytes = 0;

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      totalBytes += await directorySize(entryPath);
    } else if (entry.isFile()) {
      totalBytes += (await fs.stat(entryPath)).size;
    }
  }

  return totalBytes;
}

export function unpackedDirectoryName(platform) {
  if (platform === "win") {
    return "win-unpacked";
  }
  if (platform === "linux") {
    return "linux-unpacked";
  }
  throw new Error(`Unsupported package platform: ${platform}`);
}

export async function verifyPackagedApp({
  unpackedDirectory,
  limits = PACKAGE_LIMITS,
  readAsarEntries = listPackage
}) {
  const applicationArchive = path.join(unpackedDirectory, "resources", "app.asar");
  const localesDirectory = path.join(unpackedDirectory, "locales");
  const [asarStats, localeEntries, unpackedBytes] = await Promise.all([
    fs.stat(applicationArchive),
    fs.readdir(localesDirectory, { withFileTypes: true }),
    directorySize(unpackedDirectory)
  ]);

  const errors = [
    ...inspectAsarEntries(await readAsarEntries(applicationArchive)),
    ...inspectLocaleFiles(
      localeEntries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    )
  ];

  if (asarStats.size > limits.appAsarBytes) {
    errors.push(
      `app.asar is ${formatBytes(asarStats.size)}. The limit is ${formatBytes(limits.appAsarBytes)}.`
    );
  }
  if (unpackedBytes > limits.unpackedBytes) {
    errors.push(
      `The unpacked application is ${formatBytes(unpackedBytes)}. The limit is ${formatBytes(limits.unpackedBytes)}.`
    );
  }

  if (errors.length > 0) {
    throw new Error(`Package verification failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    appAsarBytes: asarStats.size,
    localeCount: localeEntries.filter((entry) => entry.isFile()).length,
    unpackedBytes
  };
}

export async function verifyPackagedAppForPlatform(platform, releaseDirectory = "release") {
  return verifyPackagedApp({
    unpackedDirectory: path.resolve(releaseDirectory, unpackedDirectoryName(platform))
  });
}

export function formatBytes(bytes) {
  return `${(bytes / MEBIBYTE).toFixed(2)} MiB`;
}

export function formatPackageReport(report) {
  return [
    "Package verification passed.",
    `app.asar: ${formatBytes(report.appAsarBytes)}`,
    `Unpacked application: ${formatBytes(report.unpackedBytes)}`,
    `Electron locales: ${report.localeCount}`
  ].join("\n");
}

async function runCli() {
  const platformArgumentIndex = process.argv.indexOf("--platform");
  const platform = platformArgumentIndex >= 0
    ? process.argv[platformArgumentIndex + 1]
    : process.platform === "win32"
      ? "win"
      : "linux";
  const directoryArgumentIndex = process.argv.indexOf("--directory");
  const unpackedDirectory = directoryArgumentIndex >= 0
    ? path.resolve(process.argv[directoryArgumentIndex + 1] ?? "")
    : path.resolve("release", unpackedDirectoryName(platform));

  const report = await verifyPackagedApp({ unpackedDirectory });
  console.log(formatPackageReport(report));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
