import { describe, expect, it } from "vite-plus/test";
import { NodeProcessRunner } from "./processRunner";

describe("NodeProcessRunner.runBinary", () => {
  it("preserves arbitrary bytes", async () => {
    const result = await new NodeProcessRunner().runBinary(process.execPath, ["-e", "process.stdout.write(Buffer.from([0,255,128,65]))"], { maxBytes: 16 });
    expect(result.exitCode).toBe(0);
    expect([...result.stdout]).toEqual([0, 255, 128, 65]);
  });

  it("stops output beyond the configured limit", async () => {
    const result = await new NodeProcessRunner().runBinary(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(32))"], { maxBytes: 8 });
    expect(result.exceededLimit).toBe(true);
    expect(result.stdout.byteLength).toBe(0);
  });
});
