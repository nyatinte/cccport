import { homedir } from "node:os";
import { join } from "node:path";
import type { ScanResult } from "../../types.js";
import { buildFileList } from "./build.js";
import { walkClaudeDir } from "./walk.js";

const CLAUDE_DIR = ".claude";

/** Test helper: inject roots instead of relying on homedir. */
export const scanWithRoots = async (
  globalRoot: string,
  projectRoot: string
): Promise<ScanResult> => {
  const [globalEntries, projectEntries] = await Promise.all([
    walkClaudeDir(globalRoot),
    walkClaudeDir(projectRoot),
  ]);
  return {
    globalRoot,
    projectRoot,
    files: buildFileList(
      globalRoot,
      projectRoot,
      globalEntries,
      projectEntries
    ),
  };
};

/**
 * Scan ~/.claude (global) and <projectCwd>/.claude (project).
 * Pass globalRoot to override ~/.claude in tests.
 */
export const scanClaudeDirs = (
  projectCwd: string,
  globalRoot?: string
): Promise<ScanResult> =>
  scanWithRoots(
    globalRoot ?? join(homedir(), CLAUDE_DIR),
    join(projectCwd, CLAUDE_DIR)
  );

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { createFixture } = await import("fs-fixture");

  describe("scanWithRoots", () => {
    it("returns empty files when both dirs are empty", async () => {
      // given
      await using g = await createFixture({});
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(files).toHaveLength(0);
    });

    it("detects a file that exists only in global", async () => {
      // given
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("settings.json");
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(false);
    });

    it("detects a file that exists only in project", async () => {
      // given
      await using g = await createFixture({});
      await using p = await createFixture({ "CLAUDE.md": "# hello" });
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("CLAUDE.md");
      expect(files[0]?.existsGlobal).toBe(false);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("detects a file that exists in both", async () => {
      // given
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({ "settings.json": "{}" });
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(files).toHaveLength(1);
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("shows skills/<name> as a directory entry", async () => {
      // given
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      const skill = files.find((f) => f.relativePath === "skills/my-debug");
      expect(skill).toBeDefined();
      expect(skill?.isDirectory).toBe(true);
    });

    it('"skills" parent dir itself should NOT appear', async () => {
      // given
      await using g = await createFixture({});
      await g.mkdir("skills");
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(files.find((f) => f.relativePath === "skills")).toBeUndefined();
    });

    it("individual files inside skills/<name>/ are excluded", async () => {
      // given
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      expect(
        files.find((f) => f.relativePath === "skills/my-debug/SKILL.md")
      ).toBeUndefined();
    });

    it("files come before directories in sorted output", async () => {
      // given
      await using g = await createFixture({
        "settings.json": "{}",
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      const fileIdx = files.findIndex(
        (f) => f.relativePath === "settings.json"
      );
      const dirIdx = files.findIndex(
        (f) => f.relativePath === "skills/my-debug"
      );
      expect(fileIdx).toBeLessThan(dirIdx);
    });

    it("multiple files of the same type are sorted alphabetically", async () => {
      // given
      await using g = await createFixture({
        "z-last.md": "z",
        "a-first.md": "a",
      });
      await using p = await createFixture({});
      // when
      const { files } = await scanWithRoots(g.path, p.path);
      // then
      const aIdx = files.findIndex((f) => f.relativePath === "a-first.md");
      const zIdx = files.findIndex((f) => f.relativePath === "z-last.md");
      expect(aIdx).toBeLessThan(zIdx);
    });

    it("returns empty when neither directory exists on disk", async () => {
      // when
      const { files } = await scanWithRoots(
        "/tmp/cccport-nonexistent-global",
        "/tmp/cccport-nonexistent-project"
      );
      // then
      expect(files).toHaveLength(0);
    });
  });

  describe("scanClaudeDirs", () => {
    it("accepts custom globalRoot for testing", async () => {
      // given
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      // when
      const result = await scanClaudeDirs(p.path, g.path);
      // then
      expect(result.globalRoot).toBe(g.path);
      expect(result.files.some((f) => f.relativePath === "settings.json")).toBe(
        true
      );
    });

    it("uses os.homedir()/.claude when globalRoot is omitted", async () => {
      // given
      await using p = await createFixture({});
      // when
      const result = await scanClaudeDirs(p.path);
      // then
      expect(result.globalRoot).toContain(".claude");
    });
  });
}
