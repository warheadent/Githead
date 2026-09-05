import { describe, expectTypeOf, it } from "vite-plus/test";
import type {
  CoordinatedRequest,
  GitAmendExecuteRequest,
  GitAmendPreviewRequest,
  GitAmendRestoreRequest,
  GitheadApi
} from "./types";

describe("amend IPC contract", () => {
  it("uses the preview and coordinated mutation request types", () => {
    expectTypeOf<Parameters<GitheadApi["getAmendPreview"]>[0]>().toEqualTypeOf<GitAmendPreviewRequest>();
    expectTypeOf<Parameters<GitheadApi["amendLastCommit"]>[0]>().toEqualTypeOf<CoordinatedRequest<GitAmendExecuteRequest>>();
    expectTypeOf<Parameters<GitheadApi["restoreAmendRecovery"]>[0]>().toEqualTypeOf<CoordinatedRequest<GitAmendRestoreRequest>>();
  });

  it("does not expose raw Git arguments in renderer requests", () => {
    expectTypeOf<Parameters<GitheadApi["getAmendPreview"]>[0]>().not.toHaveProperty("args");
    expectTypeOf<Parameters<GitheadApi["amendLastCommit"]>[0]>().not.toHaveProperty("args");
    expectTypeOf<Parameters<GitheadApi["restoreAmendRecovery"]>[0]>().not.toHaveProperty("args");
  });
});
