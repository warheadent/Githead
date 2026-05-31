import { describe, expect, it } from "vitest";
import { parseCommitSubject } from "./commitSubject";

describe("parseCommitSubject", () => {
  it("parses scoped conventional commit subjects", () => {
    expect(parseCommitSubject("feat(ai): add attack pressure cooldown")).toEqual({
      type: "feat",
      label: "Feature",
      scope: "ai",
      breaking: false,
      description: "add attack pressure cooldown"
    });
  });

  it("parses unscoped conventional commit subjects", () => {
    expect(parseCommitSubject("fix: held token IDs should be optional")).toEqual({
      type: "fix",
      label: "Fix",
      scope: null,
      breaking: false,
      description: "held token IDs should be optional"
    });
  });

  it("preserves breaking markers in the display label", () => {
    expect(parseCommitSubject("feat(api)!: rename payload field")).toEqual({
      type: "feat",
      label: "Feature!",
      scope: "api",
      breaking: true,
      description: "rename payload field"
    });
  });

  it("uses a title-cased label for custom types", () => {
    expect(parseCommitSubject("ops-tools(release): harden packager")).toEqual({
      type: "ops-tools",
      label: "Ops-Tools",
      scope: "release",
      breaking: false,
      description: "harden packager"
    });
  });

  it("returns null for invalid or empty-description subjects", () => {
    expect(parseCommitSubject("Add MeshBites Shader")).toBeNull();
    expect(parseCommitSubject("feat(ai):")).toBeNull();
    expect(parseCommitSubject("feat(): add graph")).toBeNull();
    expect(parseCommitSubject("fix(ai) held token IDs should be optional")).toBeNull();
  });
});
