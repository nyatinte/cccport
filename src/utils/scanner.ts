// src/utils/scanner.ts
import * as fs from 'fs-extra'
import * as path from 'node:path'
import * as os from 'node:os'
import type { ClaudeFile, ScanResult } from '../types.js'

const CLAUDE_DIR = '.claude'

/**
 * Decide whether a relative path (without trailing slash) should appear in the UI.
 *
 * Rules:
 *  - Top-level files (no slash): always show
 *  - Top-level directories that are NOT "skills": always show
 *  - "skills" directory itself: EXCLUDE (don't show)
 *  - "skills/<name>": show (isDirectory=true)
 *  - "skills/<name>/anything": EXCLUDE (deep file inside skills dir)
 *  - Any other deep path (depth >= 3): EXCLUDE
 */
function shouldInclude(relativePath: string): boolean {
  const parts = relativePath.split('/')

  if (parts.length === 1) {
    // Top-level entry — show everything except the bare "skills" directory
    // (skills itself would be shown as a dir, but we want to show its children instead)
    return parts[0] !== 'skills'
  }

  if (parts.length === 2 && parts[0] === 'skills') {
    // skills/<name> — show as a directory entry
    return true
  }

  // Everything else (depth >= 3, or non-skills depth-2) is excluded
  return false
}

/**
 * Walk a .claude directory and return all relevant entries.
 */
async function walkClaudeDir(root: string): Promise<string[]> {
  if (!(await fs.pathExists(root))) return []

  const results: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const abs = path.join(dir, entry.name)
      const rel = path.relative(root, abs)

      if (entry.isDirectory()) {
        results.push(rel + '/')
        // Only recurse into "skills" (one level deep)
        if (rel === 'skills') {
          await walk(abs)
        }
      } else {
        results.push(rel)
      }
    }
  }

  await walk(root)
  return results
}

/**
 * Merge two sets of relative paths into ClaudeFile entries.
 */
function mergeEntries(
  globalRoot: string,
  projectRoot: string,
  globalEntries: string[],
  projectEntries: string[],
): ClaudeFile[] {
  const allKeys = new Set<string>([
    ...globalEntries.map(e => e.replace(/\/$/, '')),
    ...projectEntries.map(e => e.replace(/\/$/, '')),
  ])

  const globalDirs = new Set(globalEntries.filter(e => e.endsWith('/')).map(e => e.slice(0, -1)))
  const projectDirs = new Set(projectEntries.filter(e => e.endsWith('/')).map(e => e.slice(0, -1)))

  const files: ClaudeFile[] = []

  for (const rel of allKeys) {
    if (!shouldInclude(rel)) continue

    const isDirectory = globalDirs.has(rel) || projectDirs.has(rel)
    files.push({
      relativePath: rel,
      isDirectory,
      existsGlobal: globalEntries.includes(isDirectory ? rel + '/' : rel),
      existsProject: projectEntries.includes(isDirectory ? rel + '/' : rel),
      globalPath: path.join(globalRoot, rel),
      projectPath: path.join(projectRoot, rel),
    })
  }

  // Sort: files first, then directories; alphabetical within each group
  files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? 1 : -1
    return a.relativePath.localeCompare(b.relativePath)
  })

  return files
}

/**
 * Internal helper used by tests to inject custom roots.
 */
export async function scanWithRoots(globalRoot: string, projectRoot: string): Promise<ScanResult> {
  const [globalEntries, projectEntries] = await Promise.all([
    walkClaudeDir(globalRoot),
    walkClaudeDir(projectRoot),
  ])

  const files = mergeEntries(globalRoot, projectRoot, globalEntries, projectEntries)

  return { globalRoot, projectRoot, files }
}

/**
 * Scan the global ~/.claude and the project .claude directory.
 *
 * @param projectCwd  Working directory of the project (must contain a .claude subdir)
 * @param globalRoot  Override the global root (default: os.homedir()/.claude). Used in tests.
 */
export async function scanClaudeDirs(
  projectCwd: string,
  globalRoot?: string,
): Promise<ScanResult> {
  const resolvedGlobal = globalRoot ?? path.join(os.homedir(), CLAUDE_DIR)
  const resolvedProject = path.join(projectCwd, CLAUDE_DIR)
  return scanWithRoots(resolvedGlobal, resolvedProject)
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest

  let tmpGlobal: string
  let tmpProject: string

  beforeEach(async () => {
    tmpGlobal = await fs.mkdtemp('/tmp/cccport-global-')
    tmpProject = await fs.mkdtemp('/tmp/cccport-project-')
  })

  afterEach(async () => {
    await fs.remove(tmpGlobal)
    await fs.remove(tmpProject)
  })

  describe('scanWithRoots', () => {
    it('returns empty files when both dirs are empty', async () => {
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      expect(files).toHaveLength(0)
    })

    it('detects a file that exists only in global', async () => {
      await fs.writeFile(path.join(tmpGlobal, 'settings.json'), '{}')
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      expect(files).toHaveLength(1)
      expect(files[0]?.relativePath).toBe('settings.json')
      expect(files[0]?.existsGlobal).toBe(true)
      expect(files[0]?.existsProject).toBe(false)
    })

    it('detects a file that exists only in project', async () => {
      await fs.writeFile(path.join(tmpProject, 'CLAUDE.md'), '# hello')
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      expect(files).toHaveLength(1)
      expect(files[0]?.relativePath).toBe('CLAUDE.md')
      expect(files[0]?.existsGlobal).toBe(false)
      expect(files[0]?.existsProject).toBe(true)
    })

    it('detects a file that exists in both', async () => {
      await fs.writeFile(path.join(tmpGlobal, 'settings.json'), '{}')
      await fs.writeFile(path.join(tmpProject, 'settings.json'), '{}')
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      expect(files).toHaveLength(1)
      expect(files[0]?.existsGlobal).toBe(true)
      expect(files[0]?.existsProject).toBe(true)
    })

    it('shows skills/<name> as a directory entry', async () => {
      await fs.ensureDir(path.join(tmpGlobal, 'skills', 'my-debug'))
      await fs.writeFile(path.join(tmpGlobal, 'skills', 'my-debug', 'SKILL.md'), '# skill')
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      const skillEntry = files.find(f => f.relativePath === 'skills/my-debug')
      expect(skillEntry).toBeDefined()
      expect(skillEntry?.isDirectory).toBe(true)
    })

    it('BUG CHECK: "skills" parent dir itself should NOT appear as a file entry', async () => {
      await fs.ensureDir(path.join(tmpGlobal, 'skills'))
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      // skills/ itself must NOT appear
      const skillsDir = files.find(f => f.relativePath === 'skills')
      expect(skillsDir).toBeUndefined()
    })

    it('individual files inside skills/<name>/ are excluded', async () => {
      await fs.ensureDir(path.join(tmpGlobal, 'skills', 'my-debug'))
      await fs.writeFile(path.join(tmpGlobal, 'skills', 'my-debug', 'SKILL.md'), '# skill')
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      const deepFile = files.find(f => f.relativePath === 'skills/my-debug/SKILL.md')
      expect(deepFile).toBeUndefined()
    })

    it('files come before directories in sorted output', async () => {
      await fs.writeFile(path.join(tmpGlobal, 'settings.json'), '{}')
      await fs.ensureDir(path.join(tmpGlobal, 'skills', 'my-debug'))
      const { files } = await scanWithRoots(tmpGlobal, tmpProject)
      const fileIdx = files.findIndex(f => f.relativePath === 'settings.json')
      const dirIdx = files.findIndex(f => f.relativePath === 'skills/my-debug')
      expect(fileIdx).toBeLessThan(dirIdx)
    })
  })

  describe('scanClaudeDirs', () => {
    it('scanClaudeDirs accepts custom globalRoot for testing', async () => {
      await fs.writeFile(path.join(tmpGlobal, 'settings.json'), '{}')
      const result = await scanClaudeDirs(tmpProject, tmpGlobal)
      expect(result.globalRoot).toBe(tmpGlobal)
      expect(result.files.some(f => f.relativePath === 'settings.json')).toBe(true)
    })

    it('uses os.homedir()/.claude when globalRoot is omitted', async () => {
      const result = await scanClaudeDirs(tmpProject)
      expect(result.globalRoot).toContain('.claude')
    })
  })
}
