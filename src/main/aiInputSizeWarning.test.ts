import { describe, expect, it } from "vite-plus/test";
import { createAiInputSizeWarning } from "./aiInputSizeWarning";

const request = { provider: "openrouter", model: "vendor/small-model" } as const;

describe("AI input size warnings", () => {
  it("compares estimated input with the selected model limit", async () => {
    const resolver = { getInputTokenLimit: async () => 1_000 };
    expect(await createAiInputSizeWarning(request, "a".repeat(2_247), resolver)).toBe("");
    const warning = await createAiInputSizeWarning(request, "a".repeat(2_250), resolver);
    expect(warning).toContain("vendor/small-model");
    expect(warning).toContain("roughly 750 tokens");
    expect(warning).toContain("input limit is 1,000 tokens");
    expect(await createAiInputSizeWarning(request, "a".repeat(2_250), {
      getInputTokenLimit: async () => 100_000
    })).toBe("");
  });

  it("warns conservatively when metadata is unavailable or invalid", async () => {
    expect(await createAiInputSizeWarning(request, "small diff")).toBe("");
    for (const resolver of [
      undefined,
      { getInputTokenLimit: async () => null },
      { getInputTokenLimit: async () => Number.NaN },
      { getInputTokenLimit: async (): Promise<number> => { throw new Error("offline"); } }
    ]) {
      const warning = await createAiInputSizeWarning(request, "a".repeat(96_000), resolver);
      expect(warning).toContain("roughly 32,000 tokens");
      expect(warning).toContain("input limit is unknown");
      expect(warning).toContain("sending the full diff");
    }
  });

  it("includes multibyte text in the estimate", async () => {
    const warning = await createAiInputSizeWarning(request, "界".repeat(32_000));
    expect(warning).toContain("roughly 32,000 tokens");
  });

  it("preserves cancellation during metadata lookup", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled");
    await expect(createAiInputSizeWarning(request, "diff", {
      getInputTokenLimit: async () => { controller.abort(reason); return null; }
    }, controller.signal)).rejects.toBe(reason);
  });
});
