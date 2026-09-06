import { sentryVitePlugin } from "@sentry/vite-plugin";
import packageJson from "./package.json";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();

export const sentrySourceMapUploadEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

// Uploads require maps even when local debug maps have not been requested.
export const buildSourceMaps = sentrySourceMapUploadEnabled || process.env.GITHEAD_SOURCEMAP === "1";

export const bundleTaskOptions = {
  // Replaying cached files cannot replay a Sentry upload.
  cache: !sentrySourceMapUploadEnabled,
  env: [
    "GITHEAD_SOURCEMAP",
    "SENTRY_DSN",
    "SENTRY_ENVIRONMENT",
    "SENTRY_RELEASE",
    "SENTRY_ORG",
    "SENTRY_PROJECT"
  ],
  untrackedEnv: ["SENTRY_AUTH_TOKEN"]
};

export const sentryBuildConfig = {
  dsn: process.env.SENTRY_DSN?.trim() ?? "",
  environment: process.env.SENTRY_ENVIRONMENT?.trim() ?? "",
  release: process.env.SENTRY_RELEASE?.trim() || `githead@${packageJson.version}`
};

export function createSentryVitePlugin(sourceMapPattern: string) {
  return sentryVitePlugin({
    ...(sentryAuthToken ? { authToken: sentryAuthToken } : {}),
    ...(sentryOrg ? { org: sentryOrg } : {}),
    ...(sentryProject ? { project: sentryProject } : {}),
    release: {
      name: sentryBuildConfig.release
    },
    sourcemaps: {
      filesToDeleteAfterUpload: sourceMapPattern
    },
    disable: !sentrySourceMapUploadEnabled,
    telemetry: false
  });
}
