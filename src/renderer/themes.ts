import type { AppColorTheme } from "../shared/types";

export interface ColorThemeOption {
  id: AppColorTheme;
  name: string;
  description: string;
  swatches: readonly [string, string, string];
}

export const COLOR_THEME_OPTIONS: readonly ColorThemeOption[] = [
  { id: "githead", name: "Githead", description: "Neutral green", swatches: ["oklch(0.517141 0.105719 157.892586)", "oklch(0.943724 0.007526 164.933046)", "oklch(0.307344 0.023506 246.095172)"] },
  { id: "tidepool", name: "Tidepool", description: "Ocean blue and cyan", swatches: ["oklch(0.55453 0.106867 228.395373)", "oklch(0.954644 0.023247 203.373832)", "oklch(0.316517 0.052031 241.52267)"] },
  { id: "ember", name: "Ember", description: "Amber and coral", swatches: ["oklch(0.58348 0.153088 38.942245)", "oklch(0.962469 0.02774 70.950177)", "oklch(0.321315 0.051761 34.460316)"] },
  { id: "orchid", name: "Orchid", description: "Violet and magenta", swatches: ["oklch(0.534251 0.156964 304.475121)", "oklch(0.9441 0.026186 310.401865)", "oklch(0.306427 0.063262 307.441082)"] },
  { id: "evergreen", name: "Evergreen", description: "Forest green and moss", swatches: ["oklch(0.505199 0.086433 153.372242)", "oklch(0.944473 0.024075 127.584125)", "oklch(0.329224 0.0389 151.256224)"] },
  { id: "rosewood", name: "Rosewood", description: "Burgundy and dusty rose", swatches: ["oklch(0.491266 0.106363 3.738238)", "oklch(0.939865 0.01981 9.790142)", "oklch(0.319976 0.048542 359.417353)"] },
  { id: "glacier", name: "Glacier", description: "Icy blue and slate", swatches: ["oklch(0.561238 0.077999 239.634962)", "oklch(0.952904 0.015373 222.682442)", "oklch(0.340343 0.034525 245.677546)"] },
  { id: "sunbeam", name: "Sunbeam", description: "Gold and warm cream", swatches: ["oklch(0.583779 0.123191 71.468588)", "oklch(0.963144 0.055803 93.95098)", "oklch(0.351695 0.053984 81.97422)"] },
  { id: "graphite", name: "Graphite", description: "Restrained monochrome", swatches: ["oklch(0.472236 0.018418 257.244253)", "oklch(0.948159 0.003445 247.859301)", "oklch(0.295661 0.012293 258.371556)"] },
  { id: "copper", name: "Copper", description: "Burnt orange and bronze", swatches: ["oklch(0.557912 0.110445 51.499879)", "oklch(0.930407 0.027622 67.478133)", "oklch(0.338555 0.039183 43.514271)"] },
  { id: "sakura", name: "Sakura", description: "Soft pink and plum", swatches: ["oklch(0.567215 0.121669 355.86581)", "oklch(0.947304 0.021552 351.905372)", "oklch(0.330331 0.044891 344.297582)"] },
  { id: "midnight", name: "Midnight", description: "Navy and electric blue", swatches: ["oklch(0.568612 0.195674 263.349892)", "oklch(0.940019 0.028394 268.365654)", "oklch(0.277754 0.064874 263.281563)"] }
];

export function applyColorTheme(theme: AppColorTheme): void {
  document.documentElement.dataset.theme = theme;
}
