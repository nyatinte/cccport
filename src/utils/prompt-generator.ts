// src/utils/prompt-generator.ts
import * as fs from 'fs-extra'
import { t } from '../i18n/index.js'
import type { ClaudeFile } from '../types.js'

export interface PromptDirection {
  from: 'global' | 'project'
  to: 'global' | 'project'
}

/**
 * Generate a migration prompt for Claude to help merge/apply Claude config files.
 */
export async function generateMigrationPrompt(
  file: ClaudeFile,
  direction: PromptDirection,
): Promise<string> {
  const fromLabel = direction.from === 'global'
    ? `${t('header_global')} (~/.claude)`
    : `${t('header_project')} (.claude)`
  const toLabel = direction.to === 'global'
    ? `${t('header_global')} (~/.claude)`
    : `${t('header_project')} (.claude)`

  const fromPath = direction.from === 'global' ? file.globalPath : file.projectPath
  const toPath = direction.to === 'global' ? file.globalPath : file.projectPath

  const fromContent = await readSafe(fromPath)
  const toContent = await readSafe(toPath)

  if (file.isDirectory) {
    return generateDirPrompt(file, fromLabel, toLabel, fromPath, toPath)
  }

  return generateFilePrompt(
    file.relativePath,
    fromLabel,
    toLabel,
    fromPath,
    toPath,
    fromContent,
    toContent,
  )
}

function generateFilePrompt(
  relativePath: string,
  fromLabel: string,
  toLabel: string,
  fromPath: string,
  toPath: string,
  fromContent: string | null,
  toContent: string | null,
): string {
  const lines: string[] = []

  lines.push(`# Claude Config Migration: \`${relativePath}\``)
  lines.push('')
  lines.push(`移行元 (${fromLabel}): \`${fromPath}\``)
  lines.push(`移行先 (${toLabel}): \`${toPath}\``)
  lines.push('')

  if (fromContent === null) {
    lines.push('移行元ファイルが存在しません。')
    return lines.join('\n')
  }

  lines.push('## 移行元の現在の内容')
  lines.push('')
  lines.push('```')
  lines.push(fromContent)
  lines.push('```')
  lines.push('')

  if (toContent !== null) {
    lines.push('## 移行先の現在の内容')
    lines.push('')
    lines.push('```')
    lines.push(toContent)
    lines.push('```')
    lines.push('')
    lines.push('## 指示')
    lines.push('')
    lines.push('上記2つのファイルの内容をマージして、移行先ファイルを更新してください。')
    lines.push('以下の点に注意してください:')
    lines.push('')
    lines.push('1. 移行元の設定を移行先に適用する')
    lines.push('2. 移行先にしか存在しない設定は保持する')
    lines.push('3. 競合する設定は移行元を優先する（確認が必要な場合はコメントを付ける）')
    lines.push('4. JSONの場合はフォーマットを整える')
  } else {
    lines.push('## 指示')
    lines.push('')
    lines.push('移行先にファイルが存在しないため、移行元の内容をそのままコピーしてください。')
    lines.push(`\`${toPath}\` に以下の内容で新規作成してください:`)
    lines.push('')
    lines.push('```')
    lines.push(fromContent)
    lines.push('```')
  }

  return lines.join('\n')
}

function generateDirPrompt(
  file: ClaudeFile,
  fromLabel: string,
  toLabel: string,
  fromPath: string,
  toPath: string,
): string {
  const lines: string[] = []

  lines.push(`# Claude Config Migration: \`${file.relativePath}/\` (ディレクトリ)`)
  lines.push('')
  lines.push(`移行元 (${fromLabel}): \`${fromPath}\``)
  lines.push(`移行先 (${toLabel}): \`${toPath}\``)
  lines.push('')
  lines.push('## 指示')
  lines.push('')
  lines.push('このエントリはディレクトリです。')
  lines.push('ディレクトリ内の各ファイルを確認し、必要に応じてマージまたはコピーしてください。')
  lines.push('')
  lines.push('特に `skills/` ディレクトリの場合:')
  lines.push('- 各スキルの `SKILL.md` を確認してください')
  lines.push('- 重複するスキルがある場合は内容をマージしてください')
  lines.push('- 移行先にないスキルはそのままコピーしてください')

  return lines.join('\n')
}

async function readSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest
  const fsMod = await import('fs-extra')
  const pathMod = await import('node:path')
  const { initI18n } = await import('../i18n/index.js')

  let tmpGlobal: string
  let tmpProject: string

  beforeEach(async () => {
    await initI18n('en')
    tmpGlobal = await fsMod.mkdtemp('/tmp/cccport-pg-global-')
    tmpProject = await fsMod.mkdtemp('/tmp/cccport-pg-project-')
  })

  afterEach(async () => {
    await fsMod.remove(tmpGlobal)
    await fsMod.remove(tmpProject)
  })

  describe('generateMigrationPrompt', () => {
    it('generates a prompt for a file that exists in source', async () => {
      const globalPath = pathMod.join(tmpGlobal, 'settings.json')
      await fsMod.writeFile(globalPath, '{"model": "claude-3-5-sonnet"}')

      const file: ClaudeFile = {
        relativePath: 'settings.json',
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath,
        projectPath: pathMod.join(tmpProject, 'settings.json'),
      }

      const prompt = await generateMigrationPrompt(file, { from: 'global', to: 'project' })
      expect(prompt).toContain('settings.json')
      expect(prompt).toContain('claude-3-5-sonnet')
    })

    it('generates a prompt for directory entries', async () => {
      const file: ClaudeFile = {
        relativePath: 'skills/my-debug',
        isDirectory: true,
        existsGlobal: false,
        existsProject: true,
        globalPath: pathMod.join(tmpGlobal, 'skills/my-debug'),
        projectPath: pathMod.join(tmpProject, 'skills/my-debug'),
      }

      const prompt = await generateMigrationPrompt(file, { from: 'project', to: 'global' })
      expect(prompt).toContain('skills/my-debug')
      expect(prompt).toContain('ディレクトリ')
    })

    it('uses i18n labels in header', async () => {
      await initI18n('ja')
      const file: ClaudeFile = {
        relativePath: 'settings.json',
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath: pathMod.join(tmpGlobal, 'settings.json'),
        projectPath: pathMod.join(tmpProject, 'settings.json'),
      }
      await fsMod.writeFile(file.globalPath, '{}')

      const prompt = await generateMigrationPrompt(file, { from: 'global', to: 'project' })
      expect(prompt).toContain('グローバル')
    })
  })
}
