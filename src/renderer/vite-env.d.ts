import type { GitheadApi } from "../shared/types";

declare module "*.css";
declare module "./styles.css";

declare global {
  interface Window {
    githead: GitheadApi;
  }
}

export {};
