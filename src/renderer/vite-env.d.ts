import type { GitheadApi } from "../shared/types";

declare global {
  interface Window {
    githead: GitheadApi;
  }
}

export {};

