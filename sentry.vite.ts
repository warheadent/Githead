import { sentryVitePlugin } from "@sentry/vite-plugin";
import packageJson from "./package.json";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();

export const sentrySourceMapUploadEnabled = Boolean(sentryAuthToken && sentryOrg && sentryProject);

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
