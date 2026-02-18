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
      await using g = await createFixture({});
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      expect(files).toHaveLength(0);
    });

    it("detects a file that exists only in global", async () => {
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("settings.json");
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(false);
    });

    it("detects a file that exists only in project", async () => {
      await using g = await createFixture({});
      await using p = await createFixture({ "CLAUDE.md": "# hello" });
      const { files } = await scanWithRoots(g.path, p.path);
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("CLAUDE.md");
      expect(files[0]?.existsGlobal).toBe(false);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("detects a file that exists in both", async () => {
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({ "settings.json": "{}" });
      const { files } = await scanWithRoots(g.path, p.path);
      expect(files).toHaveLength(1);
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("shows skills/<name> as a directory entry", async () => {
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      const skill = files.find((f) => f.relativePath === "skills/my-debug");
      expect(skill).toBeDefined();
      expect(skill?.isDirectory).toBe(true);
    });

    it('"skills" parent dir itself should NOT appear', async () => {
      await using g = await createFixture({});
      await g.mkdir("skills");
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      expect(files.find((f) => f.relativePath === "skills")).toBeUndefined();
    });

    it("individual files inside skills/<name>/ are excluded", async () => {
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      expect(
        files.find((f) => f.relativePath === "skills/my-debug/SKILL.md")
      ).toBeUndefined();
    });

    it("files come before directories in sorted output", async () => {
      await using g = await createFixture({
        "settings.json": "{}",
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      const fileIdx = files.findIndex(
        (f) => f.relativePath === "settings.json"
      );
      const dirIdx = files.findIndex(
        (f) => f.relativePath === "skills/my-debug"
      );
      expect(fileIdx).toBeLessThan(dirIdx);
    });

    it("multiple files of the same type are sorted alphabetically", async () => {
      await using g = await createFixture({
        "z-last.md": "z",
        "a-first.md": "a",
      });
      await using p = await createFixture({});
      const { files } = await scanWithRoots(g.path, p.path);
      const aIdx = files.findIndex((f) => f.relativePath === "a-first.md");
      const zIdx = files.findIndex((f) => f.relativePath === "z-last.md");
      expect(aIdx).toBeLessThan(zIdx);
    });

    it("returns empty when neither directory exists on disk", async () => {
      const { files } = await scanWithRoots(
        "/tmp/cccport-nonexistent-global",
        "/tmp/cccport-nonexistent-project"
      );
      expect(files).toHaveLength(0);
    });
  });

  describe("scanClaudeDirs", () => {
    it("accepts custom globalRoot for testing", async () => {
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      const result = await scanClaudeDirs(p.path, g.path);
      expect(result.globalRoot).toBe(g.path);
      expect(result.files.some((f) => f.relativePath === "settings.json")).toBe(
        true
      );
    });

    it("uses os.homedir()/.claude when globalRoot is omitted", async () => {
      await using p = await createFixture({});
      const result = await scanClaudeDirs(p.path);
      expect(result.globalRoot).toContain(".claude");
    });
  });
}
