import { readFile } from "node:fs/promises";
import type { SyncStatus } from "../../types.js";

interface SyncInput {
  existsGlobal: boolean;
  existsProject: boolean;
  globalPath: string;
  isDirectory: boolean;
  projectPath: string;
}

export const computeSyncStatus = async ({
  existsGlobal,
  existsProject,
  globalPath,
  isDirectory,
  projectPath,
}: SyncInput): Promise<SyncStatus> => {
  if (!existsGlobal) return "project-only";
  if (!existsProject) return "global-only";
  if (isDirectory) return "diverged";

  const [contentA, contentB] = await Promise.all([
    readFile(globalPath, "utf8"),
    readFile(projectPath, "utf8"),
  ]);

  return contentA === contentB ? "synced" : "diverged";
};

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { createFixture } = await import("fs-fixture");

  describe(computeSyncStatus, () => {
    it("returns global-only when existsProject is false", async () => {
      // given
      await using g = await createFixture({ "CLAUDE.md": "# hello" });
      await using p = await createFixture({});
      // when / then
      expect(
        await computeSyncStatus({
          existsGlobal: true,
          existsProject: false,
          globalPath: `${g.path}/CLAUDE.md`,
          projectPath: `${p.path}/CLAUDE.md`,
          isDirectory: false,
        })
      ).toBe("global-only");
    });

    it("returns project-only when existsGlobal is false", async () => {
      // given
      await using g = await createFixture({});
      await using p = await createFixture({ "CLAUDE.md": "# hello" });
      // when / then
      expect(
        await computeSyncStatus({
          existsGlobal: false,
          existsProject: true,
          globalPath: `${g.path}/CLAUDE.md`,
          projectPath: `${p.path}/CLAUDE.md`,
          isDirectory: false,
        })
      ).toBe("project-only");
    });

    it("returns synced when both files have identical content", async () => {
      // given
      await using g = await createFixture({ "CLAUDE.md": "# same" });
      await using p = await createFixture({ "CLAUDE.md": "# same" });
      // when / then
      expect(
        await computeSyncStatus({
          existsGlobal: true,
          existsProject: true,
          globalPath: `${g.path}/CLAUDE.md`,
          projectPath: `${p.path}/CLAUDE.md`,
          isDirectory: false,
        })
      ).toBe("synced");
    });

    it("returns diverged when both files have different content", async () => {
      // given
      await using g = await createFixture({ "CLAUDE.md": "# global" });
      await using p = await createFixture({ "CLAUDE.md": "# project" });
      // when / then
      expect(
        await computeSyncStatus({
          existsGlobal: true,
          existsProject: true,
          globalPath: `${g.path}/CLAUDE.md`,
          projectPath: `${p.path}/CLAUDE.md`,
          isDirectory: false,
        })
      ).toBe("diverged");
    });

    it("returns diverged for directories even when both exist", async () => {
      // given
      await using g = await createFixture({ "skills/my-skill/SKILL.md": "x" });
      await using p = await createFixture({ "skills/my-skill/SKILL.md": "x" });
      // when / then
      expect(
        await computeSyncStatus({
          existsGlobal: true,
          existsProject: true,
          globalPath: `${g.path}/skills/my-skill`,
          projectPath: `${p.path}/skills/my-skill`,
          isDirectory: true,
        })
      ).toBe("diverged");
    });
  });
}
