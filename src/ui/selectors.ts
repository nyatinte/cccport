import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";
import { select } from "../utils/enquirer-helpers.js";
import type { Action, Direction } from "./types.js";

export const formatFileChoice = (file: ClaudeFile, index: number): string => {
  const icon = file.isDirectory ? "📁" : "📄";
  const g = file.existsGlobal ? chalk.green("✓") : chalk.red("✗");
  const p = file.existsProject ? chalk.green("✓") : chalk.red("✗");
  return `${index}. ${icon} ${file.relativePath.padEnd(30)} ${t("header_global")}:${g}  ${t("header_project")}:${p}`;
};

export const pickFile = async (
  files: ClaudeFile[]
): Promise<ClaudeFile | null> => {
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
};

export const pickAction = (): Promise<Action> =>
  select<Action>({
    name: "action",
    message: t("action_prompt"),
    choices: [
      { name: `📋  ${t("action_copy")}`, value: "copy" },
      { name: `🔍  ${t("action_diff")}`, value: "diff" },
      { name: `🤖  ${t("action_prompt_gen")}`, value: "prompt" },
      { name: `✖   ${t("action_skip")}`, value: "skip" },
    ],
  });

export const pickDirection = (): Promise<Direction> =>
  select<Direction>({
    name: "direction",
    message: t("direction_prompt"),
    choices: [
      { name: t("direction_p2g"), value: "p2g" },
      { name: t("direction_g2p"), value: "g2p" },
    ],
  });
