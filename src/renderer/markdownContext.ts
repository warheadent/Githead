import { createContext } from "react";
import type { GitFilePreviewSource } from "@/shared/types";

export interface MarkdownRepository {
  repoPath: string;
  path: string;
  source: GitFilePreviewSource;
  onNavigate: (path: string, fragment: string) => void;
}

export const MarkdownContext = createContext<{
  repository?: MarkdownRepository | undefined;
  onAnchor: (fragment: string) => void;
}>({ onAnchor: () => undefined });
