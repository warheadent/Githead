import { describe, expect, it } from "vite-plus/test";
import { stepAppZoomFactor } from "./types";

describe("stepAppZoomFactor", () => {
  it("moves one notch in either direction and clamps at the ends", () => {
    expect(stepAppZoomFactor(1, 1)).toBe(1.1);
    expect(stepAppZoomFactor(1, -1)).toBe(0.9);
    expect(stepAppZoomFactor(2, 1)).toBe(2);
    expect(stepAppZoomFactor(0.75, -1)).toBe(0.75);
  });

  it("snaps unsupported values to the next notch in the requested direction", () => {
    expect(stepAppZoomFactor(1.2, 1)).toBe(1.25);
    expect(stepAppZoomFactor(1.2, -1)).toBe(1.1);
  });
});
