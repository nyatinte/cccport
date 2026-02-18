import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import type { ClaudeFile, ScanResult } from "../types.js";

const CLAUDE_DIR = ".claude";
const TRAILING_SLASH = /\/$/;

/**
 * Whether a relative path should appear in the UI.
 *
 * - Top-level files/dirs: show, except bare "skills" itself
 * - skills/<name>: show as isDirectory=true
 * - skills/<name>/...: exclude (too deep)
 */
function shouldInclude(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.length === 1) {
    return parts[0] !== "skills";
  }
  if (parts.length === 2 && parts[0] === "skills") {
    return true;
  }
  return false;
}

function pathExists(p: string): Promise<boolean> {
  return stat(p)
    .then(() => true)
    .catch(() => false);
}

async function walkClaudeDir(root: string): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs);
      if (entry.isDirectory()) {
        results.push(`${rel}/`);
        // Only recurse one level into skills/ — individual skill dirs are the leaf nodes
        if (rel === "skills") {
          await walk(abs);
        }
      } else {
        results.push(rel);
      }
    }
  }

  await walk(root);
  return results;
}

function buildFileList(
  globalRoot: string,
  projectRoot: string,
  globalEntries: string[],
  projectEntries: string[]
): ClaudeFile[] {
  const globalDirs = new Set(
    globalEntries.filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1))
  );
  const projectDirs = new Set(
    projectEntries.filter((e) => e.endsWith("/")).map((e) => e.slice(0, -1))
  );

  const allKeys = new Set([
    ...globalEntries.map((e) => e.replace(TRAILING_SLASH, "")),
    ...projectEntries.map((e) => e.replace(TRAILING_SLASH, "")),
  ]);

  const files: ClaudeFile[] = [];
  for (const rel of allKeys) {
    if (!shouldInclude(rel)) {
      continue;
    }
    const isDirectory = globalDirs.has(rel) || projectDirs.has(rel);
    files.push({
      relativePath: rel,
      isDirectory,
      existsGlobal: globalEntries.includes(isDirectory ? `${rel}/` : rel),
      existsProject: projectEntries.includes(isDirectory ? `${rel}/` : rel),
      globalPath: join(globalRoot, rel),
      projectPath: join(projectRoot, rel),
    });
  }

  return files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? 1 : -1;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
}

/** Test helper: inject roots instead of relying on homedir. */
export async function scanWithRoots(
  globalRoot: string,
  projectRoot: string
): Promise<ScanResult> {
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
}

/**
 * Scan ~/.claude (global) and <projectCwd>/.claude (project).
 * Pass globalRoot to override ~/.claude in tests.
 */
export function scanClaudeDirs(
  projectCwd: string,
  globalRoot?: string
): Promise<ScanResult> {
  return scanWithRoots(
    globalRoot ?? join(homedir(), CLAUDE_DIR),
    join(projectCwd, CLAUDE_DIR)
  );
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { createFixture } = await import("fs-fixture");

  // Direct unit tests for the module-private filter function
  describe("shouldInclude", () => {
    it("includes a top-level file", () => {
      // Given / When / Then
      expect(shouldInclude("settings.json")).toBe(true);
      expect(shouldInclude("CLAUDE.md")).toBe(true);
    });

    it('excludes the bare "skills" top-level entry', () => {
      // Given / When / Then
      expect(shouldInclude("skills")).toBe(false);
    });

    it("includes skills/<name> as a leaf directory", () => {
      // Given / When / Then
      expect(shouldInclude("skills/my-debug")).toBe(true);
    });

    it("excludes depth-2 paths that are not under skills/", () => {
      // Given: a hypothetical path the walker would never emit, but the guard covers it
      // When / Then
      expect(shouldInclude("foo/bar")).toBe(false);
    });

    it("excludes skills/<name>/<file> (depth-3 path)", () => {
      // Given / When / Then
      expect(shouldInclude("skills/my-debug/SKILL.md")).toBe(false);
    });
  });

  describe("scanWithRoots", () => {
    it("returns empty files when both dirs are empty", async () => {
      // Given: both global and project .claude dirs exist but are empty
      await using g = await createFixture({});
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then
      expect(files).toHaveLength(0);
    });

    it("detects a file that exists only in global", async () => {
      // Given: settings.json only in global
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("settings.json");
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(false);
    });

    it("detects a file that exists only in project", async () => {
      // Given: CLAUDE.md only in project
      await using g = await createFixture({});
      await using p = await createFixture({ "CLAUDE.md": "# hello" });
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("CLAUDE.md");
      expect(files[0]?.existsGlobal).toBe(false);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("detects a file that exists in both", async () => {
      // Given: settings.json in both global and project
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({ "settings.json": "{}" });
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then
      expect(files).toHaveLength(1);
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("shows skills/<name> as a directory entry", async () => {
      // Given: a skill directory with a file inside it
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then: the skill dir appears as isDirectory=true
      const skill = files.find((f) => f.relativePath === "skills/my-debug");
      expect(skill).toBeDefined();
      expect(skill?.isDirectory).toBe(true);
    });

    it('"skills" parent dir itself should NOT appear', async () => {
      // Given: only the bare skills/ dir (no children)
      await using g = await createFixture({});
      await g.mkdir("skills");
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then: "skills" entry is filtered out
      expect(files.find((f) => f.relativePath === "skills")).toBeUndefined();
    });

    it("individual files inside skills/<name>/ are excluded", async () => {
      // Given: skills/my-debug/SKILL.md (depth 3)
      await using g = await createFixture({
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then: only the skill dir appears, not the file inside it
      expect(
        files.find((f) => f.relativePath === "skills/my-debug/SKILL.md")
      ).toBeUndefined();
    });

    it("files come before directories in sorted output", async () => {
      // Given: a plain file and a skill directory exist
      await using g = await createFixture({
        "settings.json": "{}",
        "skills/my-debug/SKILL.md": "# skill",
      });
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then: settings.json index is lower than skills/my-debug index
      const fileIdx = files.findIndex(
        (f) => f.relativePath === "settings.json"
      );
      const dirIdx = files.findIndex(
        (f) => f.relativePath === "skills/my-debug"
      );
      expect(fileIdx).toBeLessThan(dirIdx);
    });

    it("multiple files of the same type are sorted alphabetically", async () => {
      // Given: two plain files with alphabetically distinct names
      await using g = await createFixture({
        "z-last.md": "z",
        "a-first.md": "a",
      });
      await using p = await createFixture({});
      // When
      const { files } = await scanWithRoots(g.path, p.path);
      // Then: a-first comes before z-last (localeCompare branch in sort)
      const aIdx = files.findIndex((f) => f.relativePath === "a-first.md");
      const zIdx = files.findIndex((f) => f.relativePath === "z-last.md");
      expect(aIdx).toBeLessThan(zIdx);
    });

    it("returns empty when neither directory exists on disk", async () => {
      // Given: both roots point to non-existent paths
      // When
      const { files } = await scanWithRoots(
        "/tmp/cccport-nonexistent-global",
        "/tmp/cccport-nonexistent-project"
      );
      // Then
      expect(files).toHaveLength(0);
    });
  });

  describe("scanClaudeDirs", () => {
    it("accepts custom globalRoot for testing", async () => {
      // Given: settings.json in the custom global root
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      // When
      const result = await scanClaudeDirs(p.path, g.path);
      // Then
      expect(result.globalRoot).toBe(g.path);
      expect(result.files.some((f) => f.relativePath === "settings.json")).toBe(
        true
      );
    });

    it("uses os.homedir()/.claude when globalRoot is omitted", async () => {
      // Given: no explicit globalRoot
      await using p = await createFixture({});
      // When
      const result = await scanClaudeDirs(p.path);
      // Then: globalRoot contains the default .claude suffix
      expect(result.globalRoot).toContain(".claude");
    });
  });
}
