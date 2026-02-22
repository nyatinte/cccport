# cccport

[English](./README.md) | **日本語**

Claude Code プロジェクト設定（`.claude/`）をグローバル（`~/.claude/`）とプロジェクトローカルのルート間で移行するインタラクティブ TUI。

## 必要環境

- Node.js >= 24
- pnpm

## インストール

```bash
pnpm install
```

## 使い方

```bash
pnpm dev        # tsx で直接実行（ビルド不要）
```

ビルドしてバイナリを実行する場合:

```bash
pnpm build
./dist/cli.js
```

## コマンド

```bash
pnpm dev            # tsx で実行（ビルド不要）
pnpm build          # tsc → dist/
pnpm test           # vitest run（全インソーステスト）
pnpm test:watch     # vitest watch
pnpm bench          # vitest bench
pnpm check          # biome lint + フォーマットチェック
pnpm fix            # biome lint + フォーマット自動修正
pnpm typecheck      # tsc --noEmit
```

## アーキテクチャ

```
src/
  cli.ts                    # エントリポイント — 引数解析、i18n 初期化、スキャン、runInteractive
  types.ts                  # ClaudeFile, ScanResult
  i18n/
    index.ts                # initI18n, t(), currentLocale
    cli-language-detector.ts  # CliLanguageDetector（i18next LanguageDetectorModule）
    en.ts / ja.ts           # メッセージカタログ
  ui/
    types.ts                # Action, Direction
    app.tsx                 # App, Panel — Ink 二画面 TUI（React コンポーネント）
    handlers.ts             # handleCopy, handleDiff, handlePrompt, resolvePaths
    interactive.ts          # runInteractive — Ink レンダーループ
  utils/
    diff/
      core.ts               # diffText, diffJsonObjects（純粋関数、I/O なし）
      files.ts              # diffFiles, diffJsonFiles（ディスクから読み込み）
    scanner/
      walk.ts               # pathExists, walkClaudeDir, RECURSE_DIRS
      build.ts              # shouldInclude, buildFileList（ALLOWED_TOP_LEVEL_FILES + RECURSE_DIRS）
      index.ts              # scanWithRoots, scanClaudeDirs（公開 API）
    dir-ops.ts              # copyDir, diffDir, DirFileDiff（FS レベルのディレクトリ操作）
    enquirer-helpers.ts     # 型安全な select<T> と confirm ラッパー
    prompt-generator.ts     # generateMigrationPrompt（AI プロンプトテキスト）
```

## スキャン対象エントリ

スキャナーは Claude Code として意味のあるエントリのみを対象とします:

**トップレベルファイル**: `CLAUDE.md`, `CLAUDE.local.md`, `settings.json`, `settings.local.json`, `.mcp.json`, `keybindings.json`

**コンテナディレクトリ**（直下の子エントリをリーフとして表示）: `agents/`, `skills/`, `commands/`, `hooks/`, `rules/`

## i18n

ユーザー向け文字列はすべて `t(key)` を通じて提供される。対応ロケール: `en`、`ja`（環境変数から自動検出）。
