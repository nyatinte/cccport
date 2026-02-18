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
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest;
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { initI18n } = await import("../i18n/index.js");

  let tmpGlobal: string;
  let tmpProject: string;

  beforeEach(async () => {
    await initI18n("en");
    tmpGlobal = await mkdtemp("/tmp/cccport-pg-global-");
    tmpProject = await mkdtemp("/tmp/cccport-pg-project-");
  });

  afterEach(async () => {
    await rm(tmpGlobal, { recursive: true });
    await rm(tmpProject, { recursive: true });
  });

  describe("generateMigrationPrompt", () => {
    it("generates a prompt for a file that exists in source", async () => {
      const globalPath = join(tmpGlobal, "settings.json");
      await writeFile(globalPath, '{"model": "claude-3-5-sonnet"}');

      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath,
        projectPath: join(tmpProject, "settings.json"),
      };

      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      expect(prompt).toContain("settings.json");
      expect(prompt).toContain("claude-3-5-sonnet");
    });

    it("generates a prompt for directory entries", async () => {
      const file: ClaudeFile = {
        relativePath: "skills/my-debug",
        isDirectory: true,
        existsGlobal: false,
        existsProject: true,
        globalPath: join(tmpGlobal, "skills/my-debug"),
        projectPath: join(tmpProject, "skills/my-debug"),
      };

      const prompt = await generateMigrationPrompt(file, {
        from: "project",
        to: "global",
      });
      expect(prompt).toContain("skills/my-debug");
      expect(prompt).toContain("ディレクトリ");
    });

    it("uses i18n labels in header", async () => {
      await initI18n("ja");
      const file: ClaudeFile = {
        relativePath: "settings.json",
        isDirectory: false,
        existsGlobal: true,
        existsProject: false,
        globalPath: join(tmpGlobal, "settings.json"),
        projectPath: join(tmpProject, "settings.json"),
      };
      await writeFile(file.globalPath, "{}");

      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      expect(prompt).toContain("グローバル");
    });
  });
}
