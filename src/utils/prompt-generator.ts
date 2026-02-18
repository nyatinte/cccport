import { readFile } from "node:fs/promises";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";

export interface PromptDirection {
  from: "global" | "project";
  to: "global" | "project";
}

export async function generateMigrationPrompt(
  file: ClaudeFile,
  direction: PromptDirection
): Promise<string> {
  const fromLabel =
    direction.from === "global"
      ? `${t("header_global")} (~/.claude)`
      : `${t("header_project")} (.claude)`;
  const toLabel =
    direction.to === "global"
      ? `${t("header_global")} (~/.claude)`
      : `${t("header_project")} (.claude)`;

  const fromPath =
    direction.from === "global" ? file.globalPath : file.projectPath;
  const toPath = direction.to === "global" ? file.globalPath : file.projectPath;

  if (file.isDirectory) {
    return [
      `# Claude Config Migration: \`${file.relativePath}/\` (ディレクトリ)`,
      "",
      `移行元 (${fromLabel}): \`${fromPath}\``,
      `移行先 (${toLabel}): \`${toPath}\``,
      "",
      "## 指示",
      "",
      "このエントリはディレクトリです。",
      "ディレクトリ内の各ファイルを確認し、必要に応じてマージまたはコピーしてください。",
      "",
      "特に `skills/` ディレクトリの場合:",
      "- 各スキルの `SKILL.md` を確認してください",
      "- 重複するスキルがある場合は内容をマージしてください",
      "- 移行先にないスキルはそのままコピーしてください",
    ].join("\n");
  }

  const fromContent = await readFile(fromPath, "utf-8").catch(() => null);
  const toContent = await readFile(toPath, "utf-8").catch(() => null);

  const header = [
    `# Claude Config Migration: \`${file.relativePath}\``,
    "",
    `移行元 (${fromLabel}): \`${fromPath}\``,
    `移行先 (${toLabel}): \`${toPath}\``,
    "",
  ];

  if (fromContent === null) {
    return [...header, "移行元ファイルが存在しません。"].join("\n");
  }

  if (toContent === null) {
    return [
      ...header,
      "## 指示",
      "",
      "移行先にファイルが存在しないため、移行元の内容をそのままコピーしてください。",
      `\`${toPath}\` に以下の内容で新規作成してください:`,
      "",
      "```",
      fromContent,
      "```",
    ].join("\n");
  }

  return [
    ...header,
    "## 移行元の現在の内容",
    "",
    "```",
    fromContent,
    "```",
    "",
    "## 移行先の現在の内容",
    "",
    "```",
    toContent,
    "```",
    "",
    "## 指示",
    "",
    "上記2つのファイルの内容をマージして、移行先ファイルを更新してください。",
    "以下の点に注意してください:",
    "",
    "1. 移行元の設定を移行先に適用する",
    "2. 移行先にしか存在しない設定は保持する",
    "3. 競合する設定は移行元を優先する（確認が必要な場合はコメントを付ける）",
    "4. JSONの場合はフォーマットを整える",
  ].join("\n");
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, beforeEach } = import.meta.vitest;
  const { join } = await import("node:path");
  const { createFixture } = await import("fs-fixture");
  const { initI18n } = await import("../i18n/index.js");

  beforeEach(async () => {
    await initI18n("en");
  });

  describe("generateMigrationPrompt", () => {
    it("destination-missing: includes source content for copy", async () => {
      // Given: source file exists, destination does not
      await using g = await createFixture({
        "settings.json": '{"model": "claude-3-5-sonnet"}',
      });
      await using p = await createFixture({});
      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath: join(g.path, "settings.json"),
        projectPath: join(p.path, "settings.json"),
      };
      // When
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // Then: prompt includes filename and source content
      expect(prompt).toContain("settings.json");
      expect(prompt).toContain("claude-3-5-sonnet");
    });

    it("source-missing: reports missing source without crashing", async () => {
      // Given: source file does not exist on disk
      await using g = await createFixture({});
      await using p = await createFixture({});
      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: false,
        existsProject: true,
        globalPath: join(g.path, "settings.json"),
        projectPath: join(p.path, "settings.json"),
      };
      // When
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // Then: prompt indicates source is missing
      expect(prompt).toContain("移行元ファイルが存在しません");
    });

    it("both-exist: includes both contents for merge", async () => {
      // Given: both source and destination files exist with different content
      await using g = await createFixture({
        "settings.json": '{"model": "claude-opus"}',
      });
      await using p = await createFixture({
        "settings.json": '{"theme": "dark"}',
      });
      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: true,
        existsProject: true,
        globalPath: join(g.path, "settings.json"),
        projectPath: join(p.path, "settings.json"),
      };
      // When
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // Then: prompt includes both contents and merge instructions
      expect(prompt).toContain("claude-opus");
      expect(prompt).toContain("dark");
      expect(prompt).toContain("マージ");
    });

    it("directory: generates directory-specific instructions", async () => {
      // Given: a skill directory entry (no file content to read)
      await using g = await createFixture({});
      await using p = await createFixture({});
      const file: ClaudeFile = {
        relativePath: "skills/my-debug",
        isDirectory: true,
        existsGlobal: false,
        existsProject: true,
        globalPath: join(g.path, "skills/my-debug"),
        projectPath: join(p.path, "skills/my-debug"),
      };
      // When
      const prompt = await generateMigrationPrompt(file, {
        from: "project",
        to: "global",
      });
      // Then: prompt mentions directory and skills-specific guidance
      expect(prompt).toContain("skills/my-debug");
      expect(prompt).toContain("ディレクトリ");
    });

    it("i18n: uses Japanese labels when locale is ja", async () => {
      // Given: locale set to Japanese, source file exists
      await initI18n("ja");
      await using g = await createFixture({ "settings.json": "{}" });
      await using p = await createFixture({});
      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath: join(g.path, "settings.json"),
        projectPath: join(p.path, "settings.json"),
      };
      // When
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // Then: header contains Japanese locale label
      expect(prompt).toContain("グローバル");
    });
  });
}
