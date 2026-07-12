import type { AppColorTheme } from "../shared/types";

export interface ColorThemeOption {
  id: AppColorTheme;
  name: string;
  description: string;
  swatches: readonly [string, string, string];
}

export const COLOR_THEME_OPTIONS: readonly ColorThemeOption[] = [
  { id: "githead", name: "Githead", description: "Neutral green", swatches: ["#237a50", "#e8eeeb", "#26313b"] },
  { id: "tidepool", name: "Tidepool", description: "Ocean blue and cyan", swatches: ["#087ea4", "#dff5f7", "#17354a"] },
  { id: "ember", name: "Ember", description: "Amber and coral", swatches: ["#c4542d", "#fff0df", "#4a2921"] },
  { id: "orchid", name: "Orchid", description: "Violet and magenta", swatches: ["#8250b5", "#f2e8fa", "#382648"] },
  { id: "evergreen", name: "Evergreen", description: "Forest green and moss", swatches: ["#39734d", "#e8f0df", "#263b2b"] },
  { id: "rosewood", name: "Rosewood", description: "Burgundy and dusty rose", swatches: ["#91445a", "#f8e6e8", "#472832"] },
  { id: "glacier", name: "Glacier", description: "Icy blue and slate", swatches: ["#477b9e", "#e5f2f7", "#293a49"] },
  { id: "sunbeam", name: "Sunbeam", description: "Gold and warm cream", swatches: ["#a86d08", "#fff3c9", "#493817"] },
  { id: "graphite", name: "Graphite", description: "Restrained monochrome", swatches: ["#555c66", "#eceef0", "#292d33"] },
  { id: "copper", name: "Copper", description: "Burnt orange and bronze", swatches: ["#a65f31", "#f5e5d5", "#493127"] },
  { id: "sakura", name: "Sakura", description: "Soft pink and plum", swatches: ["#ad5579", "#fae8ef", "#462c3b"] },
  { id: "midnight", name: "Midnight", description: "Navy and electric blue", swatches: ["#366de8", "#e3ebff", "#172748"] }
];

export function applyColorTheme(theme: AppColorTheme): void {
  document.documentElement.dataset.theme = theme;
}
