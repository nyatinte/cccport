import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ScanResult } from "../types.js";
import { handleCopy, handleDiff, handlePrompt } from "./handlers.js";
import { pickAction, pickDirection, pickFile } from "./selectors.js";

const printHeader = (scan: ScanResult): void => {
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
};

export const runInteractive = async (scan: ScanResult): Promise<void> => {
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
};
