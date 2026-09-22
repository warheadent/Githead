import type { GitheadApi, WorkspaceTrustApi } from "../shared/types";

declare module "*.css";
declare module "./styles.css";

declare global {
  const __APP_VERSION__: string;
  const __APP_BUILD_DATE__: string;

  interface Window {
    githead: GitheadApi;
    workspaceTrust: WorkspaceTrustApi;
  }
}

export {};
