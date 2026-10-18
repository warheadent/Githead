import { describe, expect, it } from "vite-plus/test";
import { decodePatchPath, selectPatchSectionsForPath } from "./gitPatchSections";

const copySection = [
  "diff --git a/src.txt b/copy.txt",
  "similarity index 100%",
  "copy from src.txt",
  "copy to copy.txt",
  ""
].join("\n");
const sourceSection = [
  "diff --git a/src.txt b/src.txt",
  "index 1111111..2222222 100644",
  "--- a/src.txt",
  "+++ b/src.txt",
  "@@ -1 +1,2 @@",
  " line",
  "+copy to copy.txt",
  ""
].join("\n");

describe("selectPatchSectionsForPath", () => {
  it("keeps a single-section patch unchanged", () => {
    expect(selectPatchSectionsForPath(sourceSection, "other.txt")).toBe(sourceSection);
  });

  it("keeps the copy section and drops the source file's own change", () => {
    expect(selectPatchSectionsForPath(`${copySection}${sourceSection}`, "copy.txt")).toBe(copySection);
    expect(selectPatchSectionsForPath(`${copySection}${sourceSection}`, "src.txt")).toBe(sourceSection);
  });

  it("matches renames, additions, deletions, and quoted names", () => {
    const renamed = "diff --git a/old.txt b/new.txt\nsimilarity index 90%\nrename from old.txt\nrename to new.txt\n--- a/old.txt\n+++ b/new.txt\n@@ -1 +1 @@\n-a\n+b\n";
    const added = "diff --git a/old.txt b/old.txt\nnew file mode 100644\n--- /dev/null\n+++ b/old.txt\n@@ -0,0 +1 @@\n+fresh\n";
    expect(selectPatchSectionsForPath(`${renamed}${added}`, "new.txt")).toBe(renamed);
    expect(selectPatchSectionsForPath(`${renamed}${added}`, "old.txt")).toBe(added);

    const deleted = "diff --git a/gone.txt b/gone.txt\ndeleted file mode 100644\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n";
    expect(selectPatchSectionsForPath(`${added}${deleted}`, "gone.txt")).toBe(deleted);

    const quoted = "diff --git \"a/caf\\303\\251.txt\" \"b/caf\\303\\251 new.txt\"\nrename from \"caf\\303\\251.txt\"\nrename to \"caf\\303\\251 new.txt\"\n";
    expect(selectPatchSectionsForPath(`${quoted}${added}`, "café new.txt")).toBe(quoted);
  });

  it("returns the whole patch when no section names the path", () => {
    const patch = `${copySection}${sourceSection}`;
    expect(selectPatchSectionsForPath(patch, "unrelated.txt")).toBe(patch);
  });
});

describe("decodePatchPath", () => {
  it("decodes C-style escapes and drops the tab Git appends to spaced names", () => {
    expect(decodePatchPath("\"tab\\there\\nline\\\"q\\\\\"")).toBe("tab\there\nline\"q\\");
    expect(decodePatchPath("\"b/caf\\303\\251\"")).toBe("b/café");
    expect(decodePatchPath("b/with space.txt\t")).toBe("b/with space.txt");
  });
});
