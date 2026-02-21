# cccport

Interactive TUI for migrating Claude Code project settings (`.claude/`) between global (`~/.claude/`) and project-local roots.

## Requirements

- Node.js >= 24
- pnpm

## Install

```bash
pnpm install
```

## Usage

```bash
pnpm dev        # run directly via tsx (no build)
```

Or build and run the compiled binary:

```bash
pnpm build
./dist/cli.js
```

## Commands

```bash
pnpm dev            # run via tsx (no build needed)
pnpm build          # tsc → dist/
pnpm test           # vitest run (all in-source tests)
pnpm test:watch     # vitest watch
pnpm bench          # vitest bench
pnpm check          # biome lint + format check
pnpm fix            # biome lint + format autofix
pnpm typecheck      # tsc --noEmit
```

## Architecture

```
src/
  cli.ts                    # entry point — arg parsing, i18n init, scan, runInteractive
  types.ts                  # ClaudeFile, ScanResult
  i18n/
    index.ts                # initI18n, t(), currentLocale
    cli-language-detector.ts  # CliLanguageDetector (i18next LanguageDetectorModule)
    en.ts / ja.ts           # message catalogs
  ui/
    types.ts                # Action, Direction
    selectors.ts            # pickFile, pickAction, pickDirection (enquirer prompts)
    handlers.ts             # handleCopy, handleDiff, handlePrompt
    interactive.ts          # runInteractive (main TUI loop)
  utils/
    diff/
      core.ts               # diffText, diffJsonObjects (pure, no I/O)
      files.ts              # diffFiles, diffJsonFiles (reads from disk)
    scanner/
      walk.ts               # pathExists, walkClaudeDir
      build.ts              # shouldInclude, buildFileList
      index.ts              # scanWithRoots, scanClaudeDirs (public API)
    enquirer-helpers.ts     # type-safe select<T> and confirm wrappers
    prompt-generator.ts     # generateMigrationPrompt (AI prompt text)
```

## i18n

User-facing strings are served through `t(key)`. Supported locales: `en`, `ja` (auto-detected from environment).
