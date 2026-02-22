export type SyncStatus =
  | "synced"
  | "diverged"
  | "global-only"
  | "project-only";

export interface ClaudeFile {
  /** Whether the file/dir exists in the global root */
  existsGlobal: boolean;
  /** Whether the file/dir exists in the project root */
  existsProject: boolean;
  /** Absolute path in global root (may not exist) */
  globalPath: string;
  /** True when this entry is a directory (e.g. skills/my-debug) */
  isDirectory: boolean;
  /** Absolute path in project root (may not exist) */
  projectPath: string;
  /** Path relative to the .claude root (e.g. "settings.json", "skills/my-debug") */
  relativePath: string;
  /** Sync relationship between the two sides */
  syncStatus: SyncStatus;
}

export interface ScanResult {
  files: ClaudeFile[];
  globalRoot: string;
  projectRoot: string;
}
