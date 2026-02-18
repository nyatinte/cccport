// src/utils/diff.ts
import * as fs from 'fs-extra'
import { parse as parseJsonc } from 'jsonc-parser'

export interface DiffResult {
  /** Human-readable unified-diff-like lines */
  lines: string[]
  /** One-line summary */
  summary: string
  /** True when the two contents are identical */
  identical: boolean
}

/**
 * Produce a simple line-based diff between two text files.
 * Returns a DiffResult regardless of whether the files exist.
 */
export async function diffFiles(pathA: string, pathB: string): Promise<DiffResult> {
  const [rawA, rawB] = await Promise.all([
    readSafe(pathA),
    readSafe(pathB),
  ])

  if (rawA === null && rawB === null) {
    return { lines: [], summary: 'Both files missing', identical: true }
  }
  if (rawA === null) {
    return {
      lines: (rawB ?? '').split('\n').map(l => `+ ${l}`),
      summary: 'Only exists in destination',
      identical: false,
    }
  }
  if (rawB === null) {
    return {
      lines: rawA.split('\n').map(l => `- ${l}`),
      summary: 'Only exists in source',
      identical: false,
    }
  }

  if (rawA === rawB) {
    return { lines: [], summary: 'Files are identical', identical: true }
  }

  const linesA = rawA.split('\n')
  const linesB = rawB.split('\n')
  const diff = computeLCS(linesA, linesB)

  const added = diff.filter(d => d.type === '+').length
  const removed = diff.filter(d => d.type === '-').length
  const summary = `${added} line(s) added, ${removed} line(s) removed`

  return {
    lines: diff.map(d => `${d.type} ${d.line}`),
    summary,
    identical: false,
  }
}

/**
 * Diff two JSON/JSONC files at the key level and return a human-readable summary.
 */
export async function diffJsonFiles(pathA: string, pathB: string): Promise<DiffResult> {
  const [rawA, rawB] = await Promise.all([
    readSafe(pathA),
    readSafe(pathB),
  ])

  const objA = rawA ? tryParseJsonc(rawA) : null
  const objB = rawB ? tryParseJsonc(rawB) : null

  if (objA === null && objB === null) {
    return { lines: [], summary: 'Both files missing or invalid JSON', identical: true }
  }

  // Fall back to text diff if either is not valid JSON
  if (objA === null || objB === null) {
    return diffFiles(pathA, pathB)
  }

  const lines: string[] = []
  const keysAll = new Set([...Object.keys(objA), ...Object.keys(objB)])

  for (const key of keysAll) {
    const valA = JSON.stringify(objA[key])
    const valB = JSON.stringify(objB[key])

    if (!(key in objA)) {
      lines.push(`+ "${key}": ${valB}`)
    } else if (!(key in objB)) {
      lines.push(`- "${key}": ${valA}`)
    } else if (valA !== valB) {
      lines.push(`- "${key}": ${valA}`)
      lines.push(`+ "${key}": ${valB}`)
    }
  }

  if (lines.length === 0) {
    return { lines: [], summary: 'Files are identical', identical: true }
  }

  const added = lines.filter(l => l.startsWith('+')).length
  const removed = lines.filter(l => l.startsWith('-')).length
  return {
    lines,
    summary: `${added} key(s) added/changed, ${removed} key(s) removed/changed`,
    identical: false,
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function readSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

function tryParseJsonc(raw: string): Record<string, unknown> | null {
  try {
    const errors: unknown[] = []
    const result = parseJsonc(raw, errors)
    if (errors.length > 0) return null
    if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
    return result as Record<string, unknown>
  } catch {
    return null
  }
}

type DiffLine = { type: '+' | '-' | ' '; line: string }

function computeLCS(linesA: string[], linesB: string[]): DiffLine[] {
  const m = linesA.length
  const n = linesB.length

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // Backtrack
  const result: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      result.unshift({ type: ' ', line: linesA[i - 1]! })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      result.unshift({ type: '+', line: linesB[j - 1]! })
      j--
    } else {
      result.unshift({ type: '-', line: linesA[i - 1]! })
      i--
    }
  }

  return result
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest
  const fsMod = await import('fs-extra')
  const pathMod = await import('node:path')

  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fsMod.mkdtemp('/tmp/cccport-diff-')
  })

  afterEach(async () => {
    await fsMod.remove(tmpDir)
  })

  describe('diffFiles', () => {
    it('identical files → identical=true', async () => {
      const a = pathMod.join(tmpDir, 'a.txt')
      const b = pathMod.join(tmpDir, 'b.txt')
      await fsMod.writeFile(a, 'hello\nworld')
      await fsMod.writeFile(b, 'hello\nworld')
      const result = await diffFiles(a, b)
      expect(result.identical).toBe(true)
    })

    it('different files → identical=false with summary', async () => {
      const a = pathMod.join(tmpDir, 'a.txt')
      const b = pathMod.join(tmpDir, 'b.txt')
      await fsMod.writeFile(a, 'hello\nworld')
      await fsMod.writeFile(b, 'hello\nearth')
      const result = await diffFiles(a, b)
      expect(result.identical).toBe(false)
      expect(result.summary).toMatch(/line/)
    })

    it('missing file A → reports only-in-destination', async () => {
      const a = pathMod.join(tmpDir, 'missing.txt')
      const b = pathMod.join(tmpDir, 'b.txt')
      await fsMod.writeFile(b, 'hello')
      const result = await diffFiles(a, b)
      expect(result.identical).toBe(false)
      expect(result.lines.every(l => l.startsWith('+'))).toBe(true)
    })
  })

  describe('diffJsonFiles', () => {
    it('identical JSON → identical=true', async () => {
      const a = pathMod.join(tmpDir, 'a.json')
      const b = pathMod.join(tmpDir, 'b.json')
      await fsMod.writeFile(a, '{"key": 1}')
      await fsMod.writeFile(b, '{"key": 1}')
      const result = await diffJsonFiles(a, b)
      expect(result.identical).toBe(true)
    })

    it('different JSON keys → reports differences', async () => {
      const a = pathMod.join(tmpDir, 'a.json')
      const b = pathMod.join(tmpDir, 'b.json')
      await fsMod.writeFile(a, '{"key": 1, "old": true}')
      await fsMod.writeFile(b, '{"key": 2, "new": true}')
      const result = await diffJsonFiles(a, b)
      expect(result.identical).toBe(false)
      expect(result.lines.some(l => l.includes('key'))).toBe(true)
    })
  })
}
