import type { GitheadApi, WorkspaceTrustApi } from "../shared/types";

declare module "*.css";
declare module "./styles.css";

declare global {
  interface Window {
    githead: GitheadApi;
    workspaceTrust: WorkspaceTrustApi;
  }
}

export {};
