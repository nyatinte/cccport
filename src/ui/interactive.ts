import chalk from "chalk";
import { render } from "ink";
import { createElement } from "react";
import { t } from "../i18n/index.js";
import type { ScanResult } from "../types.js";
import type { AppSelection } from "./app.js";
import { App } from "./app.js";
import { handleCopy, handleDiff, handlePrompt } from "./handlers.js";

const pickFromUI = (scan: ScanResult): Promise<AppSelection | null> =>
  new Promise((resolve) => {
    const { waitUntilExit } = render(
      createElement(
        App as React.ComponentType<{
          scan: ScanResult;
          onAction: (sel: AppSelection | null) => void;
        }>,
        {
          scan,
          onAction: resolve,
        }
      ),
      // Ink is the sole writer while the TUI is active; console output only
      // occurs after unmount, so patching is unnecessary and can cause flicker.
      { patchConsole: false }
    );
    waitUntilExit().catch(() => resolve(null));
  });

export const runInteractive = async (scan: ScanResult): Promise<void> => {
  while (true) {
    const sel = await pickFromUI(scan);
    if (sel === null) {
      break;
    }

    console.log("");
    if (sel.action === "copy") {
      await handleCopy(sel.file, sel.direction);
    } else if (sel.action === "diff") {
      await handleDiff(sel.file, sel.direction);
    } else if (sel.action === "prompt") {
      await handlePrompt(sel.file, sel.direction);
    }
    console.log("");
  }

  console.log(chalk.green(t("goodbye")));
};
