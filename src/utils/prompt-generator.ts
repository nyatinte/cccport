import { readFile } from "node:fs/promises";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";

export type PromptDirection = {
  from: "global" | "project";
  to: "global" | "project";
};

export const generateMigrationPrompt = async (
  file: ClaudeFile,
  direction: PromptDirection
): Promise<string> => {
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
      `# Claude Config Migration: \`${file.relativePath}/\` ${t("prompt_dir_suffix")}`,
      "",
      `${t("prompt_from")} (${fromLabel}): \`${fromPath}\``,
      `${t("prompt_to")} (${toLabel}): \`${toPath}\``,
      "",
      t("prompt_instructions_heading"),
      "",
      t("prompt_dir_is_dir"),
      t("prompt_dir_check_files"),
      "",
      t("prompt_dir_skills_note"),
      t("prompt_dir_check_skill_md"),
      t("prompt_dir_merge_dups"),
      t("prompt_dir_copy_new"),
    ].join("\n");
  }

  const fromContent = await readFile(fromPath, "utf-8").catch(() => null);
  const toContent = await readFile(toPath, "utf-8").catch(() => null);

  const header = [
    `# Claude Config Migration: \`${file.relativePath}\``,
    "",
    `${t("prompt_from")} (${fromLabel}): \`${fromPath}\``,
    `${t("prompt_to")} (${toLabel}): \`${toPath}\``,
    "",
  ];

  if (fromContent === null) {
    return [...header, t("prompt_source_missing")].join("\n");
  }

  if (toContent === null) {
    return [
      ...header,
      t("prompt_instructions_heading"),
      "",
      t("prompt_dest_missing_body"),
      `\`${toPath}\` ${t("prompt_dest_create_at")}`,
      "",
      "```",
      fromContent,
      "```",
    ].join("\n");
  }

  return [
    ...header,
    t("prompt_source_heading"),
    "",
    "```",
    fromContent,
    "```",
    "",
    t("prompt_dest_heading"),
    "",
    "```",
    toContent,
    "```",
    "",
    t("prompt_instructions_heading"),
    "",
    t("prompt_merge_body"),
    t("prompt_merge_notes"),
    "",
    t("prompt_merge_note1"),
    t("prompt_merge_note2"),
    t("prompt_merge_note3"),
    t("prompt_merge_note4"),
  ].join("\n");
};

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
      // given
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
      // when
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // then
      expect(prompt).toContain("settings.json");
      expect(prompt).toContain("claude-3-5-sonnet");
    });

    it("source-missing: reports missing source without crashing", async () => {
      // given
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
      // when
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // then
      expect(prompt).toContain("Source file does not exist");
    });

    it("both-exist: includes both contents for merge", async () => {
      // given
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
      // when
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // then
      expect(prompt).toContain("claude-opus");
      expect(prompt).toContain("dark");
      expect(prompt).toContain("Merge");
    });

    it("directory: generates directory-specific instructions", async () => {
      // given
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
      // when
      const prompt = await generateMigrationPrompt(file, {
        from: "project",
        to: "global",
      });
      // then
      expect(prompt).toContain("skills/my-debug");
      expect(prompt).toContain("directory");
    });

    it("i18n: uses Japanese labels when locale is ja", async () => {
      // given
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
      // when
      const prompt = await generateMigrationPrompt(file, {
        from: "global",
        to: "project",
      });
      // then
      expect(prompt).toContain("グローバル");
    });
  });
}
