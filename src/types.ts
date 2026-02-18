// src/types.ts — shared types

export interface ClaudeFile {
  /** Path relative to the .claude root (e.g. "settings.json", "skills/my-debug") */
  relativePath: string
  /** True when this entry is a directory (e.g. skills/my-debug) */
  isDirectory: boolean
  /** Whether the file/dir exists in the global root */
  existsGlobal: boolean
  /** Whether the file/dir exists in the project root */
  existsProject: boolean
  /** Absolute path in global root (may not exist) */
  globalPath: string
  /** Absolute path in project root (may not exist) */
  projectPath: string
}

export interface ScanResult {
  globalRoot: string
  projectRoot: string
  files: ClaudeFile[]
}

export type CopyDirection = 'global-to-project' | 'project-to-global'

export interface CopyOptions {
  direction: CopyDirection
  backupSuffix?: string
}
