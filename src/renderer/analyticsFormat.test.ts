import { describe, expect, it } from "vite-plus/test";
import {
  binAxisTicks,
  formatBytes,
  formatDuration,
  formatPointChange,
  formatShare,
  formatSignedChange,
  niceScale,
  splitPath
} from "./analyticsFormat";

describe("analytics formatting", () => {
  it("formats byte sizes with decimal units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(334_000_000)).toBe("334 MB");
    expect(formatBytes(22_462_229_009)).toBe("22.5 GB");
  });

  it("formats durations", () => {
    expect(formatDuration(null)).toBe("–");
    expect(formatDuration(9.5)).toBe("10s");
    expect(formatDuration(260)).toBe("4m 20s");
    expect(formatDuration(3_900)).toBe("1h 05m");
  });

  it("keeps small and almost-complete shares readable", () => {
    expect(formatShare(0.0004)).toBe("<0.1%");
    expect(formatShare(0.003)).toBe("0.3%");
    expect(formatShare(0.995)).toBe("99.5%");
    expect(formatShare(1)).toBe("100%");
    expect(formatShare(0.42)).toBe("42%");
  });

  it("describes changes against a previous period", () => {
    expect(formatSignedChange(149, 100)).toEqual({ direction: 1, text: "+49%" });
    expect(formatSignedChange(50, 100)).toEqual({ direction: -1, text: "−50%" });
    expect(formatSignedChange(3, 0)).toEqual({ direction: 1, text: "new activity" });
    expect(formatPointChange(0.73, 0.652)).toEqual({ direction: 1, text: "+7.8 pts" });
  });

  it("chooses clean axis maximums", () => {
    expect(niceScale(153)).toEqual({ max: 200, step: 50 });
    expect(niceScale(0)).toEqual({ max: 1, step: 0.25 });
    expect(niceScale(7.3)).toEqual({ max: 8, step: 2 });
  });

  it("labels Januaries on monthly axes and spaces other ticks", () => {
    const months = [new Date(2025, 10, 1), new Date(2025, 11, 1), new Date(2026, 0, 1), new Date(2026, 1, 1)].map((date) => date.getTime() / 1000);
    expect(binAxisTicks(months, "month", 600)).toEqual([2]);
    expect(binAxisTicks(Array.from({ length: 90 }, (_, index) => index * 86_400), "day", 400)).toEqual([0, 18, 36, 54, 72]);
  });

  it("splits paths into folder and file name", () => {
    expect(splitPath("Source/Game/Player.cpp")).toEqual({ folder: "Source/Game/", name: "Player.cpp" });
    expect(splitPath("README.md")).toEqual({ folder: "", name: "README.md" });
  });
});
