// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  normalizeRepositoryOrganization,
  organizeRepositories,
  readRepositoryOrganization,
  repositoryLabels,
  REPOSITORY_ORGANIZATION_KEY,
} from "./repositoryOrganization";
import type { RepositoryGroup } from "../shared/types";

const organization = () =>
  normalizeRepositoryOrganization({
    version: 1,
    projects: [
      { id: "work", name: "Work", collapsed: true },
      { id: "tools", name: "Tools", collapsed: false },
    ],
    repositories: {
      "/a/main": { pinned: true, projectId: "work" },
      "/b/main": { projectId: "work", hidden: true, alias: "Old engine" },
      "/tools/cli": { projectId: "tools" },
    },
  });
afterEach(() => window.localStorage.clear());
describe("repository organization", () => {
  it("keeps manual repository and project order, with pins shown only once", () => {
    const result = organizeRepositories(
      ["/tools/cli", "/a/main", "/b/main", "/other"],
      [],
      organization(),
      "",
      true,
      "",
    );
    expect(result.map((section) => [section.name, section.paths, section.collapsed])).toEqual([
      ["Pinned", ["/a/main"], false],
      ["Work", ["/b/main"], true],
      ["Tools", ["/tools/cli"], false],
      ["Ungrouped", ["/other"], false],
    ]);
  });
  it("searches hidden aliases and opens collapsed projects without changing saved state", () => {
    const saved = organization();
    expect(organizeRepositories(["/b/main"], [], saved, " ENGINE ", false, "")).toEqual([
      { id: "project:work", name: "Work", paths: ["/b/main"], collapsed: false },
    ]);
    expect(saved.projects[0]?.collapsed).toBe(true);
    expect(
      organizeRepositories(["/b/main"], [], saved, "", false, "").flatMap(
        (section) => section.paths,
      ),
    ).toEqual([]);
  });
  it("keeps a hidden active worktree's repository available and searches branch names", () => {
    const group: RepositoryGroup = {
      id: "repo",
      recentPaths: ["/b/main"],
      commonDir: "/b/main/.git",
      anchorPath: "/b/main",
      lastUsedPath: "/trees/fix",
      kind: "git",
      error: "",
      worktrees: [
        {
          path: "/trees/fix",
          branch: "fix/stream",
          head: null,
          isMain: false,
          isBare: false,
          isDetached: false,
          locked: false,
          lockReason: null,
          prunable: false,
          prunableReason: null,
        },
      ],
    };
    const saved = organization();
    saved.projects[0]!.collapsed = false;
    expect(
      organizeRepositories(["/b/main"], [group], saved, "", false, "/trees/fix").flatMap(
        (section) => section.paths,
      ),
    ).toEqual(["/b/main"]);
    expect(
      organizeRepositories(["/b/main"], [group], saved, "stream", false, "").flatMap(
        (section) => section.paths,
      ),
    ).toEqual(["/b/main"]);
  });
  it("uses enough parent path to distinguish duplicate names and respects aliases", () => {
    const paths = ["/client/src/app", "/personal/src/app", "/single/other"];
    const labels = repositoryLabels(paths, normalizeRepositoryOrganization(null));
    expect([...labels.values()]).toEqual([
      { name: "app", detail: "client/src" },
      { name: "app", detail: "personal/src" },
      { name: "other", detail: "" },
    ]);
    expect(
      repositoryLabels(
        ["C:\\Work\\App", "D:\\Play\\App"],
        normalizeRepositoryOrganization(null),
      ).get("c:\\work\\app")?.detail,
    ).toBe("Work");
  });
  it("recovers malformed storage and ignores invalid members and unknown groups", () => {
    window.localStorage.setItem(REPOSITORY_ORGANIZATION_KEY, "{");
    expect(readRepositoryOrganization()).toEqual(normalizeRepositoryOrganization(null));
    expect(normalizeRepositoryOrganization({ version: 42, projects: [] })).toEqual(
      normalizeRepositoryOrganization(null),
    );
    const recovered = normalizeRepositoryOrganization({
      version: 1,
      projects: [null, { id: "a", name: " Valid " }, { id: "a", name: "Duplicate" }],
      repositories: { "/test": { alias: 123, pinned: "true", projectId: "missing" } },
      expandedWorktrees: [null, "repo", "repo"],
    });
    expect(recovered.projects).toEqual([{ id: "a", name: "Valid", collapsed: false }]);
    expect(recovered.repositories["/test"]).toEqual({
      alias: "",
      pinned: false,
      hidden: false,
      projectId: "",
    });
    expect(recovered.expandedWorktrees).toEqual(["repo"]);
  });
});
