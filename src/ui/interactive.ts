// src/ui/interactive.ts
import chalk from 'chalk'
import * as fs from 'fs-extra'
import * as path from 'node:path'
import { t } from '../i18n/index.js'
import { diffFiles, diffJsonFiles } from '../utils/diff.js'
import { generateMigrationPrompt } from '../utils/prompt-generator.js'
import { select, confirm } from '../utils/enquirer-helpers.js'
import type { ClaudeFile, ScanResult } from '../types.js'

// ── Types ─────────────────────────────────────────────────────────────────────

type Action = 'copy' | 'diff' | 'prompt' | 'skip'
type Direction = 'p2g' | 'g2p'

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runInteractive(scan: ScanResult): Promise<void> {
  printHeader(scan)

  if (scan.files.length === 0) {
    console.log(chalk.yellow(t('no_files_found')))
    return
  }

  // Main loop: keep showing file selector until user picks "Done"
  while (true) {
    const file = await pickFile(scan.files)
    if (file === null) break

    const action = await pickAction()
    if (action === 'skip') {
      console.log(chalk.gray(t('skipped')))
      continue
    }

    const direction = await pickDirection()

    switch (action) {
      case 'copy':
        await handleCopy(file, direction)
        break
      case 'diff':
        await handleDiff(file, direction)
        break
      case 'prompt':
        await handlePrompt(file, direction)
        break
    }
  }

  console.log(chalk.green(t('goodbye')))
}

// ── Header ────────────────────────────────────────────────────────────────────

function printHeader(scan: ScanResult): void {
  const width = 60
  const bar = '━'.repeat(width)

  console.log('')
  console.log(chalk.bold(`━━━ ${t('header_title')} ${bar.slice(t('header_title').length + 4)}`))
  console.log(`  ${chalk.cyan(t('header_global'))}:  ${scan.globalRoot}`)
  console.log(`  ${chalk.cyan(t('header_project'))}: ${scan.projectRoot}`)
  console.log('─'.repeat(width))
  console.log('')
}

// ── File picker ───────────────────────────────────────────────────────────────

async function pickFile(files: ClaudeFile[]): Promise<ClaudeFile | null> {
  const DONE_VALUE = '__done__'

  const choices = [
    ...files.map((f, i) => ({
      name: formatFileChoice(f, i + 1),
      value: String(i),
    })),
    { name: t('done_option'), value: DONE_VALUE },
  ]

  const value = await select<string>({
    name: 'file',
    message: t('select_file_prompt'),
    choices,
  })

  if (value === DONE_VALUE) return null
  return files[Number(value)] ?? null
}

function formatFileChoice(file: ClaudeFile, index: number): string {
  const icon = file.isDirectory ? '📁' : '📄'
  const g = fileStatusBadge(file.existsGlobal)
  const p = fileStatusBadge(file.existsProject)
  const name = file.relativePath.padEnd(30)
  return `${index}. ${icon} ${name} ${t('header_global')}:${g}  ${t('header_project')}:${p}`
}

function fileStatusBadge(exists: boolean): string {
  return exists ? chalk.green('✓') : chalk.red('✗')
}

// ── Action picker ─────────────────────────────────────────────────────────────

async function pickAction(): Promise<Action> {
  return select<Action>({
    name: 'action',
    message: t('action_prompt'),
    choices: [
      { name: `📋  ${t('action_copy')}`,         value: 'copy' },
      { name: `🔍  ${t('action_diff')}`,          value: 'diff' },
      { name: `🤖  ${t('action_prompt_gen')}`,    value: 'prompt' },
      { name: `✖   ${t('action_skip')}`,          value: 'skip' },
    ],
  })
}

// ── Direction picker ──────────────────────────────────────────────────────────

async function pickDirection(): Promise<Direction> {
  return select<Direction>({
    name: 'direction',
    message: t('direction_prompt'),
    choices: [
      { name: t('direction_p2g'), value: 'p2g' },
      { name: t('direction_g2p'), value: 'g2p' },
    ],
  })
}

function directionToPaths(
  file: ClaudeFile,
  direction: Direction,
): { src: string; dst: string; fromLabel: string; toLabel: string } {
  if (direction === 'p2g') {
    return {
      src: file.projectPath,
      dst: file.globalPath,
      fromLabel: t('header_project'),
      toLabel: t('header_global'),
    }
  }
  return {
    src: file.globalPath,
    dst: file.projectPath,
    fromLabel: t('header_global'),
    toLabel: t('header_project'),
  }
}

// ── Copy handler ──────────────────────────────────────────────────────────────

async function handleCopy(file: ClaudeFile, direction: Direction): Promise<void> {
  const { src, dst, toLabel } = directionToPaths(file, direction)

  if (file.isDirectory) {
    console.log(chalk.yellow(t('copy_dir_not_supported')))
    // Show directory contents
    const exists = await fs.pathExists(src)
    if (exists) {
      const entries = await fs.readdir(src)
      entries.forEach(e => console.log(`  ${e}`))
    }
    return
  }

  const dstExists = await fs.pathExists(dst)

  if (dstExists) {
    console.log('')

    // Show diff before overwrite
    const isJson = file.relativePath.endsWith('.json')
    const diff = isJson
      ? await diffJsonFiles(src, dst)
      : await diffFiles(src, dst)

    if (diff.identical) {
      console.log(chalk.gray(`  ${file.relativePath} ${t('copy_already_exists')} ${toLabel} (identical)`))
      return
    }

    console.log(chalk.bold(`  ${t('copy_changes_apply')}`))
    diff.lines.slice(0, 20).forEach(line => {
      if (line.startsWith('+')) {
        console.log(chalk.green(`  ${line}`))
      } else if (line.startsWith('-')) {
        console.log(chalk.red(`  ${line}`))
      } else {
        console.log(`  ${line}`)
      }
    })
    console.log(`  ${chalk.dim(t('diff_summary_label'))} ${diff.summary}`)
    console.log('')

    const overwrite = await confirm({
      name: 'overwrite',
      message: `${t('copy_overwrite_q')} ${dst}?`,
      initial: false,
    })

    if (!overwrite) {
      console.log(chalk.gray(t('copy_skipped')))
      return
    }

    // Backup
    const backupPath = `${dst}.bak.${Date.now()}`
    await fs.copy(dst, backupPath)
    console.log(chalk.dim(`  ${t('copy_backed_up')} ${backupPath}`))
  }

  await fs.ensureDir(path.dirname(dst))
  await fs.copy(src, dst)
  console.log(chalk.green(`  ✓ ${t('copy_done')} ${src} → ${dst}`))
}

// ── Diff handler ──────────────────────────────────────────────────────────────

async function handleDiff(file: ClaudeFile, direction: Direction): Promise<void> {
  const { src, dst } = directionToPaths(file, direction)

  if (file.isDirectory) {
    console.log(chalk.yellow(t('copy_dir_not_supported')))
    return
  }

  const isJson = file.relativePath.endsWith('.json')
  const diff = isJson
    ? await diffJsonFiles(src, dst)
    : await diffFiles(src, dst)

  console.log('')
  if (diff.identical) {
    console.log(chalk.gray('  (identical)'))
    return
  }

  diff.lines.forEach(line => {
    if (line.startsWith('+')) {
      console.log(chalk.green(`  ${line}`))
    } else if (line.startsWith('-')) {
      console.log(chalk.red(`  ${line}`))
    } else {
      console.log(chalk.dim(`  ${line}`))
    }
  })

  console.log('')
  console.log(`  ${chalk.bold(t('diff_summary_label'))} ${diff.summary}`)
  console.log('')
}

// ── Migration Prompt handler ──────────────────────────────────────────────────

async function handlePrompt(file: ClaudeFile, direction: Direction): Promise<void> {
  const fromKey = direction === 'p2g' ? 'project' : 'global'
  const toKey   = direction === 'p2g' ? 'global'  : 'project'

  const prompt = await generateMigrationPrompt(file, { from: fromKey, to: toKey })

  console.log('')
  console.log(chalk.bold(`═══ ${t('prompt_header')} ═══`))
  console.log('')
  console.log(prompt)
  console.log('')
  console.log('═'.repeat(60))
  console.log('')
}
