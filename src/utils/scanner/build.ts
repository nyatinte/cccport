import { join } from "node:path";
import type { ClaudeFile } from "../../types.js";

const TRAILING_SLASH = /\/$/;

/**
 * Whether a relative path should appear in the UI.
 *
 * - Top-level files/dirs: show, except bare "skills" itself
 * - skills/<name>: show as isDirectory=true
 * - skills/<name>/...: exclude (too deep)
 */
const shouldInclude = (rel: string): boolean => {
  const parts = rel.split("/");
  if (parts.length === 1) {
    return parts[0] !== "skills";
  }
  if (parts.length === 2 && parts[0] === "skills") {
    return true;
  }
  return false;
};

export const buildFileList = (
  globalRoot: string,
  projectRoot: string,
  globalEntries: string[],
  projectEntries: string[]
): ClaudeFile[] => {
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
};

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe(shouldInclude, () => {
    it("includes a top-level file", () => {
      expect(shouldInclude("settings.json")).toBe(true);
      expect(shouldInclude("CLAUDE.md")).toBe(true);
    });

    it('excludes the bare "skills" top-level entry', () => {
      expect(shouldInclude("skills")).toBe(false);
    });

    it("includes skills/<name> as a leaf directory", () => {
      expect(shouldInclude("skills/my-debug")).toBe(true);
    });

    it("excludes depth-2 paths that are not under skills/", () => {
      expect(shouldInclude("foo/bar")).toBe(false);
    });

    it("excludes skills/<name>/<file> (depth-3 path)", () => {
      expect(shouldInclude("skills/my-debug/SKILL.md")).toBe(false);
    });
  });
}
