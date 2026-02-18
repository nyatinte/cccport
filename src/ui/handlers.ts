import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";
import { diffFiles, diffJsonFiles } from "../utils/diff/index.js";
import { confirm } from "../utils/enquirer-helpers.js";
import { generateMigrationPrompt } from "../utils/prompt-generator.js";
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

export const handleCopy = async (
  file: ClaudeFile,
  direction: Direction
): Promise<void> => {
  const { src, dst, toLabel } = resolvePaths(file, direction);

  if (file.isDirectory) {
    console.log(chalk.yellow(t("copy_dir_not_supported")));
    const entries = await readdir(src).catch(() => [] as string[]);
    for (const e of entries) {
      console.log(`  ${e}`);
    }
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
  for (const line of diff.lines.slice(0, 20)) {
    if (line.startsWith("+")) {
      console.log(chalk.green(`  ${line}`));
    } else if (line.startsWith("-")) {
      console.log(chalk.red(`  ${line}`));
    } else {
      console.log(`  ${line}`);
    }
  }
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
  await copyFile(dst, backupPath).catch(() => null); // only backs up if dst exists
  const backedUp = await stat(backupPath)
    .then(() => true)
    .catch(() => false);
  if (backedUp) {
    console.log(chalk.dim(`  ${t("copy_backed_up")} ${backupPath}`));
  }

  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
  console.log(chalk.green(`  ✓ ${t("copy_done")} ${src} → ${dst}`));
};

export const handleDiff = async (
  file: ClaudeFile,
  direction: Direction
): Promise<void> => {
  const { src, dst } = resolvePaths(file, direction);

  if (file.isDirectory) {
    console.log(chalk.yellow(t("copy_dir_not_supported")));
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

  for (const line of diff.lines) {
    if (line.startsWith("+")) {
      console.log(chalk.green(`  ${line}`));
    } else if (line.startsWith("-")) {
      console.log(chalk.red(`  ${line}`));
    } else {
      console.log(chalk.dim(`  ${line}`));
    }
  }
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
