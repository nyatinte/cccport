import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ClaudeFile, ScanResult } from "../types.js";
import { diffFiles, diffJsonFiles } from "../utils/diff.js";
import { confirm, select } from "../utils/enquirer-helpers.js";
import { generateMigrationPrompt } from "../utils/prompt-generator.js";

type Action = "copy" | "diff" | "prompt" | "skip";
type Direction = "p2g" | "g2p";

export async function runInteractive(scan: ScanResult): Promise<void> {
  printHeader(scan);

  if (scan.files.length === 0) {
    console.log(chalk.yellow(t("no_files_found")));
    return;
  }

  while (true) {
    const file = await pickFile(scan.files);
    if (file === null) {
      break;
    }

    const action = await pickAction();
    if (action === "skip") {
      console.log(chalk.gray(t("skipped")));
      continue;
    }

    const direction = await pickDirection();

    if (action === "copy") {
      await handleCopy(file, direction);
    } else if (action === "diff") {
      await handleDiff(file, direction);
    } else if (action === "prompt") {
      await handlePrompt(file, direction);
    }
  }

  console.log(chalk.green(t("goodbye")));
}

function printHeader(scan: ScanResult): void {
  const bar = "━".repeat(60);
  console.log("");
  console.log(
    chalk.bold(
      `━━━ ${t("header_title")} ${bar.slice(t("header_title").length + 4)}`
    )
  );
  console.log(`  ${chalk.cyan(t("header_global"))}:  ${scan.globalRoot}`);
  console.log(`  ${chalk.cyan(t("header_project"))}: ${scan.projectRoot}`);
  console.log("─".repeat(60));
  console.log("");
}

async function pickFile(files: ClaudeFile[]): Promise<ClaudeFile | null> {
  const DONE = "__done__";
  const choices = [
    ...files.map((f, i) => ({
      name: formatFileChoice(f, i + 1),
      value: String(i),
    })),
    { name: t("done_option"), value: DONE },
  ];
  const value = await select<string>({
    name: "file",
    message: t("select_file_prompt"),
    choices,
  });
  return value === DONE ? null : (files[Number(value)] ?? null);
}

function formatFileChoice(file: ClaudeFile, index: number): string {
  const icon = file.isDirectory ? "📁" : "📄";
  const g = file.existsGlobal ? chalk.green("✓") : chalk.red("✗");
  const p = file.existsProject ? chalk.green("✓") : chalk.red("✗");
  return `${index}. ${icon} ${file.relativePath.padEnd(30)} ${t("header_global")}:${g}  ${t("header_project")}:${p}`;
}

function pickAction(): Promise<Action> {
  return select<Action>({
    name: "action",
    message: t("action_prompt"),
    choices: [
      { name: `📋  ${t("action_copy")}`, value: "copy" },
      { name: `🔍  ${t("action_diff")}`, value: "diff" },
      { name: `🤖  ${t("action_prompt_gen")}`, value: "prompt" },
      { name: `✖   ${t("action_skip")}`, value: "skip" },
    ],
  });
}

function pickDirection(): Promise<Direction> {
  return select<Direction>({
    name: "direction",
    message: t("direction_prompt"),
    choices: [
      { name: t("direction_p2g"), value: "p2g" },
      { name: t("direction_g2p"), value: "g2p" },
    ],
  });
}

function resolvePaths(
  file: ClaudeFile,
  direction: Direction
): { src: string; dst: string; toLabel: string } {
  return direction === "p2g"
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
}

async function handleCopy(
  file: ClaudeFile,
  direction: Direction
): Promise<void> {
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
}

async function handleDiff(
  file: ClaudeFile,
  direction: Direction
): Promise<void> {
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
}

async function handlePrompt(
  file: ClaudeFile,
  direction: Direction
): Promise<void> {
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
}
