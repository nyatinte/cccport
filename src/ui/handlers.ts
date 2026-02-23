import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";
import { diffFiles, diffJsonFiles } from "../utils/diff/files.js";
import { copyDir, diffDir } from "../utils/dir-ops.js";
import { confirm } from "../utils/enquirer-helpers.js";
import { generateMigrationPrompt } from "../utils/prompt-generator.js";
import { pathExists } from "../utils/scanner/walk.js";
import type { Direction } from "./types.js";

export const resolvePaths = (
  file: ClaudeFile,
  direction: Direction
): { src: string; dst: string; toLabel: string } =>
  direction === "p2g"
    ? {
        src: file.projectPath,
        dst: file.globalPath,
        toLabel: t("header_global"),
      }
    : {
        src: file.globalPath,
        dst: file.projectPath,
        toLabel: t("header_project"),
      };

const renderDiffLines = (lines: string[], indent = "  "): void => {
  for (const line of lines) {
    if (line.startsWith("+")) {
      console.log(chalk.green(`${indent}${line}`));
    } else if (line.startsWith("-")) {
      console.log(chalk.red(`${indent}${line}`));
    } else {
      console.log(chalk.dim(`${indent}${line}`));
    }
  }
};

export const handleCopy = async (
  file: ClaudeFile,
  direction: Direction
): Promise<void> => {
  const { src, dst, toLabel } = resolvePaths(file, direction);

  if (file.isDirectory) {
    const entries = await readdir(src).catch(() => [] as string[]);
    console.log("");
    console.log(chalk.bold(`  ${t("copy_dir_listing")}`));
    for (const e of entries) {
      console.log(`    ${e}`);
    }
    console.log("");

    const overwrite = await confirm({
      name: "overwrite",
      message: `${t("copy_overwrite_q")} ${dst}?`,
      initial: false,
    });
    if (!overwrite) {
      console.log(chalk.gray(t("copy_skipped")));
      return;
    }

    const { backupPath } = await copyDir(src, dst);
    if (backupPath) {
      console.log(chalk.dim(`  ${t("copy_backed_up")} ${backupPath}`));
    }
    console.log(chalk.green(`  ✓ ${t("copy_done")} ${src} → ${dst}`));
    return;
  }

  const diff = file.relativePath.endsWith(".json")
    ? await diffJsonFiles(src, dst)
    : await diffFiles(src, dst);

  if (diff.identical) {
    console.log(
      chalk.gray(
        `  ${file.relativePath} ${t("copy_already_exists")} ${toLabel} (identical)`
      )
    );
    return;
  }

  console.log("");
  console.log(chalk.bold(`  ${t("copy_changes_apply")}`));
  renderDiffLines(diff.lines.slice(0, 20));
  console.log(`  ${chalk.dim(t("diff_summary_label"))} ${diff.summary}`);
  console.log("");

  const overwrite = await confirm({
    name: "overwrite",
    message: `${t("copy_overwrite_q")} ${dst}?`,
    initial: false,
  });
  if (!overwrite) {
    console.log(chalk.gray(t("copy_skipped")));
    return;
  }

  const backupPath = `${dst}.bak.${Date.now()}`;
  const backedUp = await pathExists(dst);
  if (backedUp) {
    await copyFile(dst, backupPath);
    console.log(chalk.dim(`  ${t("copy_backed_up")} ${backupPath}`));
  }

  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
  console.log(chalk.green(`  ✓ ${t("copy_done")} ${src} → ${dst}`));
};

const renderDirDiff = (diffs: Awaited<ReturnType<typeof diffDir>>): void => {
  for (const d of diffs) {
    if (d.status === "src-only") {
      console.log(chalk.green(`  + ${d.name} ${t("diff_dir_src_only")}`));
    } else if (d.status === "dst-only") {
      console.log(chalk.red(`  - ${d.name} ${t("diff_dir_dst_only")}`));
    } else if (d.status === "identical") {
      console.log(chalk.gray(`    ${d.name} (identical)`));
    } else {
      console.log(chalk.bold(`  [${d.name}]`));
      renderDiffLines(d.lines, "    ");
      console.log(`    ${chalk.dim(t("diff_summary_label"))} ${d.summary}`);
    }
  }
};

export const handleDiff = async (
  file: ClaudeFile,
  direction: Direction
): Promise<void> => {
  const { src, dst } = resolvePaths(file, direction);

  if (file.isDirectory) {
    const diffs = await diffDir(src, dst);
    console.log("");
    renderDirDiff(diffs);
    console.log("");
    return;
  }

  const diff = file.relativePath.endsWith(".json")
    ? await diffJsonFiles(src, dst)
    : await diffFiles(src, dst);

  console.log("");
  if (diff.identical) {
    console.log(chalk.gray("  (identical)"));
    return;
  }

  renderDiffLines(diff.lines);
  console.log("");
  console.log(`  ${chalk.bold(t("diff_summary_label"))} ${diff.summary}`);
  console.log("");
};

export const handlePrompt = async (
  file: ClaudeFile,
  direction: Direction
): Promise<void> => {
  const from = direction === "p2g" ? "project" : "global";
  const to = direction === "p2g" ? "global" : "project";
  const prompt = await generateMigrationPrompt(file, { from, to });

  console.log("");
  console.log(chalk.bold(`═══ ${t("prompt_header")} ═══`));
  console.log("");
  console.log(prompt);
  console.log("");
  console.log("═".repeat(60));
  console.log("");
};
