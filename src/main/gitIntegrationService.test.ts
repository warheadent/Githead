import { describe, expect, it } from "vite-plus/test";
import { parseNameStatusZ } from "./gitIntegrationService";

describe("Git integration plumbing parsers", () => {
  it("parses NUL-delimited paths without splitting spaces or Unicode", () => {
    expect(parseNameStatusZ("M\0folder/a file ü.txt\0R100\0old name.txt\0new 東京.txt\0")).toEqual([
      { status: "M", path: "folder/a file ü.txt" },
      { status: "R100", originalPath: "old name.txt", path: "new 東京.txt" }
    ]);
  });
});

