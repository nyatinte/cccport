#!/usr/bin/env node
import { initI18n } from "./i18n/index.js";
import { runInteractive } from "./ui/interactive.js";
import { scanClaudeDirs } from "./utils/scanner.js";

const args = process.argv.slice(2);

function getFlag(flags: string[]): string | undefined {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && idx + 1 < args.length) {
      return args[idx + 1];
    }
  }
  return undefined;
}

function hasFlag(flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

if (hasFlag(["-h", "--help"])) {
  console.log(
    `
Usage: cccport [options]

Options:
  -p, --project <path>   Project directory (default: current directory)
  -l, --lang <locale>    Language: en | ja (default: auto-detect)
  -h, --help             Show this help
  -v, --version          Show version
`.trim()
  );
  process.exit(0);
}

if (hasFlag(["-v", "--version"])) {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };
  console.log(pkg.version);
  process.exit(0);
}

const projectCwd = getFlag(["-p", "--project"]) ?? process.cwd();
const langArg = getFlag(["-l", "--lang"]) as "en" | "ja" | undefined;

await initI18n(langArg);
const scan = await scanClaudeDirs(projectCwd);
await runInteractive(scan);
