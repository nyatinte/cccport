import { join } from "node:path";
import type { ClaudeFile } from "../../types.js";
import { RECURSE_DIRS } from "./walk.js";

const TRAILING_SLASH = /\/$/;

/** Top-level files with special meaning in Claude Code */
const ALLOWED_TOP_LEVEL_FILES = new Set([
  "CLAUDE.md",
  "CLAUDE.local.md",
  "settings.json",
  "settings.local.json",
  ".mcp.json",
  "keybindings.json",
]);

/**
 * Whether a relative path should appear in the UI.
 *
 * - Allowed top-level files: CLAUDE.md, settings.json, .mcp.json, etc.
 * - Container dirs (agents, skills, commands, hooks, rules) are never shown as bare entries
 * - <container>/<name>: shown as a leaf entry (file or directory)
 * - Everything else: excluded
 */
const shouldInclude = (rel: string): boolean => {
  const parts = rel.split("/");
  const first = parts[0];
  if (parts.length === 1) {
    return first !== undefined && ALLOWED_TOP_LEVEL_FILES.has(first);
  }
  if (parts.length === 2 && first !== undefined && RECURSE_DIRS.has(first)) {
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
    const aSlash = a.relativePath.indexOf("/");
    const bSlash = b.relativePath.indexOf("/");
    // Top-level entries (no slash) come before container entries
    if (aSlash === -1 && bSlash !== -1) {
      return -1;
    }
    if (aSlash !== -1 && bSlash === -1) {
      return 1;
    }
    return a.relativePath.localeCompare(b.relativePath);
  });
};

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe(shouldInclude, () => {
    it("includes allowed top-level files", () => {
      expect(shouldInclude("CLAUDE.md")).toBe(true);
      expect(shouldInclude("CLAUDE.local.md")).toBe(true);
      expect(shouldInclude("settings.json")).toBe(true);
      expect(shouldInclude("settings.local.json")).toBe(true);
      expect(shouldInclude(".mcp.json")).toBe(true);
      expect(shouldInclude("keybindings.json")).toBe(true);
    });

    it("excludes unknown top-level files", () => {
      expect(shouldInclude("foo.txt")).toBe(false);
      expect(shouldInclude("random.md")).toBe(false);
    });

    it("excludes bare container directory names", () => {
      expect(shouldInclude("skills")).toBe(false);
      expect(shouldInclude("agents")).toBe(false);
      expect(shouldInclude("commands")).toBe(false);
      expect(shouldInclude("hooks")).toBe(false);
      expect(shouldInclude("rules")).toBe(false);
    });

    it("includes <container>/<name> as a leaf entry", () => {
      expect(shouldInclude("skills/my-debug")).toBe(true);
      expect(shouldInclude("agents/code-reviewer.md")).toBe(true);
      expect(shouldInclude("commands/review.md")).toBe(true);
      expect(shouldInclude("hooks/protect-files.sh")).toBe(true);
      expect(shouldInclude("rules/code-style.md")).toBe(true);
    });

    it("excludes depth-2 paths under unknown top-level dirs", () => {
      expect(shouldInclude("foo/bar")).toBe(false);
    });

    it("excludes depth-3 paths (e.g. skills/<name>/<file>)", () => {
      expect(shouldInclude("skills/my-debug/SKILL.md")).toBe(false);
    });
  });
}
