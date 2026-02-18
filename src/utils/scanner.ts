import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest;

  let tmpGlobal: string;
  let tmpProject: string;

  beforeEach(async () => {
    tmpGlobal = await mkdtemp("/tmp/cccport-global-");
    tmpProject = await mkdtemp("/tmp/cccport-project-");
  });

  afterEach(async () => {
    await rm(tmpGlobal, { recursive: true });
    await rm(tmpProject, { recursive: true });
  });

  describe("scanWithRoots", () => {
    it("returns empty files when both dirs are empty", async () => {
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(files).toHaveLength(0);
    });

    it("detects a file that exists only in global", async () => {
      await writeFile(join(tmpGlobal, "settings.json"), "{}");
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("settings.json");
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(false);
    });

    it("detects a file that exists only in project", async () => {
      await writeFile(join(tmpProject, "CLAUDE.md"), "# hello");
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(files).toHaveLength(1);
      expect(files[0]?.relativePath).toBe("CLAUDE.md");
      expect(files[0]?.existsGlobal).toBe(false);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("detects a file that exists in both", async () => {
      await writeFile(join(tmpGlobal, "settings.json"), "{}");
      await writeFile(join(tmpProject, "settings.json"), "{}");
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(files).toHaveLength(1);
      expect(files[0]?.existsGlobal).toBe(true);
      expect(files[0]?.existsProject).toBe(true);
    });

    it("shows skills/<name> as a directory entry", async () => {
      await mkdir(join(tmpGlobal, "skills", "my-debug"), { recursive: true });
      await writeFile(
        join(tmpGlobal, "skills", "my-debug", "SKILL.md"),
        "# skill"
      );
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      const skill = files.find((f) => f.relativePath === "skills/my-debug");
      expect(skill).toBeDefined();
      expect(skill?.isDirectory).toBe(true);
    });

    it('"skills" parent dir itself should NOT appear', async () => {
      await mkdir(join(tmpGlobal, "skills"), { recursive: true });
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(files.find((f) => f.relativePath === "skills")).toBeUndefined();
    });

    it("individual files inside skills/<name>/ are excluded", async () => {
      await mkdir(join(tmpGlobal, "skills", "my-debug"), { recursive: true });
      await writeFile(
        join(tmpGlobal, "skills", "my-debug", "SKILL.md"),
        "# skill"
      );
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      expect(
        files.find((f) => f.relativePath === "skills/my-debug/SKILL.md")
      ).toBeUndefined();
    });

    it("files come before directories in sorted output", async () => {
      await writeFile(join(tmpGlobal, "settings.json"), "{}");
      await mkdir(join(tmpGlobal, "skills", "my-debug"), { recursive: true });
      const { files } = await scanWithRoots(tmpGlobal, tmpProject);
      const fileIdx = files.findIndex(
        (f) => f.relativePath === "settings.json"
      );
      const dirIdx = files.findIndex(
        (f) => f.relativePath === "skills/my-debug"
      );
      expect(fileIdx).toBeLessThan(dirIdx);
    });
  });

  describe("scanClaudeDirs", () => {
    it("accepts custom globalRoot for testing", async () => {
      await writeFile(join(tmpGlobal, "settings.json"), "{}");
      const result = await scanClaudeDirs(tmpProject, tmpGlobal);
      expect(result.globalRoot).toBe(tmpGlobal);
      expect(result.files.some((f) => f.relativePath === "settings.json")).toBe(
        true
      );
    });

    it("uses os.homedir()/.claude when globalRoot is omitted", async () => {
      const result = await scanClaudeDirs(tmpProject);
      expect(result.globalRoot).toContain(".claude");
    });
  });
}
