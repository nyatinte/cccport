# cccport

Interactive TUI for migrating Claude Code project settings (`.claude/`) between global (`~/.claude/`) and project-local roots.

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
    app.tsx                 # App, Panel — Ink two-panel TUI (React components)
    handlers.ts             # handleCopy, handleDiff, handlePrompt, resolvePaths
    interactive.ts          # runInteractive — Ink render loop
  utils/
    diff/
      core.ts               # diffText, diffJsonObjects (pure, no I/O)
      files.ts              # diffFiles, diffJsonFiles (reads from disk)
    scanner/
      walk.ts               # pathExists, walkClaudeDir
      build.ts              # shouldInclude, buildFileList
      index.ts              # scanWithRoots, scanClaudeDirs (public API)
    dir-ops.ts              # copyDir, diffDir, DirFileDiff (FS-level dir operations)
    enquirer-helpers.ts     # type-safe select<T> and confirm wrappers
    prompt-generator.ts     # generateMigrationPrompt (AI prompt text)
```

## Coding conventions

**Types**
- Use `interface` for object type definitions; `type` for unions/aliases
- Biome enforces this via `useConsistentTypeDefinitions` (ultracite default)

**Functions**
- Arrow functions everywhere; no `function` declarations

**Modules**
- No barrel files (`index.ts` that only re-exports) — Biome's `noBarrelFile` rule is active
- Import directly from the file that owns the export
- NodeNext resolution: always use `.js` extension in import paths even for `.ts` sources

**Linting**
- No `biome-ignore` suppressions — fix the root cause instead
- Use `vi.stubEnv` / `vi.unstubAllEnvs` instead of `delete process.env.*`

## Testing

Tests live in the same file as the code they test (Vitest in-source tests):

```ts
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe(myFn, () => {
    it("does something", () => {
      // given
      const input = "foo";
      // when / then
      expect(myFn(input)).toBe("bar");
    });
  });
}
```

Use a function (or class) reference as the first argument to `describe` — Vitest uses `.name` to label the suite. When a suite covers multiple functions, fall back to a string (e.g. `describe("initI18n + t()", ...)`). This applies to both in-source tests and standalone bench files.

Markers: `// given`, `// when`, `// then`, `// when / then` — short, no description after.

Env variables in tests:

```ts
afterEach(() => { vi.unstubAllEnvs(); });

it("...", () => {
  vi.stubEnv("LANG", "ja_JP.UTF-8");
  vi.stubEnv("LC_ALL", undefined); // unset
  // ...
});
```

## i18n

All user-facing strings go through `t(key)`. To add a new string:
1. Add the key + English value to `src/i18n/en.ts`
2. Add the matching Japanese value to `src/i18n/ja.ts`
3. Use `t("your_key")` in the code

The `ja messages cover all en keys` test in `i18n/index.ts` will fail if translations are missing.
