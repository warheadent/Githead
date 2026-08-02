import type { AppCodeFont, AppUiFont } from "../shared/types";

export interface FontOption<T extends string> {
  id: T;
  name: string;
  description: string;
  previewFamily: string;
}

export const UI_FONT_OPTIONS: readonly FontOption<AppUiFont>[] = [
  { id: "system", name: "System", description: "Matches your operating system.", previewFamily: "system-ui, sans-serif" },
  { id: "inter", name: "Inter", description: "Clean and compact for dense interfaces.", previewFamily: "'Inter Variable', sans-serif" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", description: "Technical with a distinctive voice.", previewFamily: "'IBM Plex Sans Variable', sans-serif" },
  { id: "roboto", name: "Roboto", description: "Familiar and highly readable.", previewFamily: "'Roboto Variable', sans-serif" }
];

export const CODE_FONT_OPTIONS: readonly FontOption<AppCodeFont>[] = [
  { id: "system-mono", name: "System Mono", description: "Uses the platform's native monospace face.", previewFamily: "ui-monospace, monospace" },
  { id: "jetbrains-mono", name: "JetBrains Mono", description: "Tall, clear forms designed for code.", previewFamily: "'JetBrains Mono Variable', monospace" },
  { id: "fira-code", name: "Fira Code", description: "A popular face with programming ligatures.", previewFamily: "'Fira Code Variable', monospace" },
  { id: "source-code-pro", name: "Source Code Pro", description: "Restrained and exceptionally legible.", previewFamily: "'Source Code Pro Variable', monospace" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", description: "Crisp, technical, and characterful.", previewFamily: "'IBM Plex Mono', monospace" }
];
