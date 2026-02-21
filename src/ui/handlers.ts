import { copyFile, cp, mkdir, readdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import chalk from "chalk";
import { t } from "../i18n/index.js";
import type { ClaudeFile } from "../types.js";
import { diffFiles, diffJsonFiles } from "../utils/diff/files.js";
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

const renderDirDiff = (diffs: DirFileDiff[]): void => {
  for (const d of diffs) {
    if (d.status === "src-only") {
      console.log(chalk.green(`  + ${d.name} ${t("diff_dir_src_only")}`));
    } else if (d.status === "dst-only") {
      console.log(chalk.red(`  - ${d.name} ${t("diff_dir_dst_only")}`));
    } else if (d.status === "identical") {
      console.log(chalk.gray(`    ${d.name} (identical)`));
    } else {
      console.log(chalk.bold(`  [${d.name}]`));
      for (const line of d.lines) {
        if (line.startsWith("+")) {
          console.log(chalk.green(`    ${line}`));
        } else if (line.startsWith("-")) {
          console.log(chalk.red(`    ${line}`));
        } else {
          console.log(chalk.dim(`    ${line}`));
        }
      }
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

export type DirFileDiff =
  | { name: string; status: "src-only" }
  | { name: string; status: "dst-only" }
  | { name: string; status: "identical" }
  | { name: string; status: "changed"; lines: string[]; summary: string };

export const copyDir = async (
  src: string,
  dst: string
): Promise<{ files: string[]; backupPath: string | null }> => {
  const files = await readdir(src);
  const dstExists = await stat(dst)
    .then(() => true)
    .catch(() => false);
  let backupPath: string | null = null;
  if (dstExists) {
    backupPath = `${dst}.bak.${Date.now()}`;
    await rename(dst, backupPath);
  }
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true });
  return { files, backupPath };
};

export const diffDir = async (
  src: string,
  dst: string
): Promise<DirFileDiff[]> => {
  const srcFiles = await readdir(src).catch(() => [] as string[]);
  const dstFiles = await readdir(dst).catch(() => [] as string[]);
  const allNames = new Set([...srcFiles, ...dstFiles]);

  const results: DirFileDiff[] = [];
  for (const name of allNames) {
    const inSrc = srcFiles.includes(name);
    const inDst = dstFiles.includes(name);
    if (!inSrc) {
      results.push({ name, status: "dst-only" });
      continue;
    }
    if (!inDst) {
      results.push({ name, status: "src-only" });
      continue;
    }
    const srcPath = join(src, name);
    const dstPath = join(dst, name);
    const diff = name.endsWith(".json")
      ? await diffJsonFiles(srcPath, dstPath)
      : await diffFiles(srcPath, dstPath);
    if (diff.identical) {
      results.push({ name, status: "identical" });
    } else {
      results.push({
        name,
        status: "changed",
        lines: diff.lines,
        summary: diff.summary,
      });
    }
  }
  return results;
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

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { join: pathJoin } = await import("node:path");
  const { createFixture } = await import("fs-fixture");
  const { readdir: fsReaddir } = await import("node:fs/promises");

  describe("copyDir", () => {
    it("copies all files to dst when dst does not exist", async () => {
      // given
      await using src = await createFixture({
        "SKILL.md": "# my-skill",
        "helper.sh": "echo hi",
      });
      await using dst = await createFixture({});
      const dstPath = pathJoin(dst.path, "skill-copy");

      // when
      const { files, backupPath } = await copyDir(src.path, dstPath);

      // then
      expect(backupPath).toBeNull();
      expect(files.sort()).toEqual(["SKILL.md", "helper.sh"]);
      const copied = await fsReaddir(dstPath);
      expect(copied.sort()).toEqual(["SKILL.md", "helper.sh"]);
    });

    it("backs up existing dst before copying", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# new" });
      await using dst = await createFixture({});
      const dstPath = pathJoin(dst.path, "skill");
      await cp(src.path, dstPath, { recursive: true });

      // when
      const { backupPath } = await copyDir(src.path, dstPath);

      // then
      expect(backupPath).not.toBeNull();
      expect(backupPath).toContain(".bak.");
      const backupFiles = await fsReaddir(backupPath as string);
      expect(backupFiles).toContain("SKILL.md");
    });
  });

  describe("diffDir", () => {
    it("reports src-only for a file that exists only in src", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# skill" });
      await using dst = await createFixture({});

      // when
      const diffs = await diffDir(src.path, dst.path);

      // then
      expect(diffs).toEqual([{ name: "SKILL.md", status: "src-only" }]);
    });

    it("reports dst-only for a file that exists only in dst", async () => {
      // given
      await using src = await createFixture({});
      await using dst = await createFixture({ "SKILL.md": "# skill" });

      // when
      const diffs = await diffDir(src.path, dst.path);

      // then
      expect(diffs).toEqual([{ name: "SKILL.md", status: "dst-only" }]);
    });

    it("reports identical for matching files", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# skill" });
      await using dst = await createFixture({ "SKILL.md": "# skill" });

      // when
      const diffs = await diffDir(src.path, dst.path);

      // then
      expect(diffs).toEqual([{ name: "SKILL.md", status: "identical" }]);
    });

    it("reports changed with diff lines for differing files", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# new\nextra" });
      await using dst = await createFixture({ "SKILL.md": "# old" });

      // when
      const diffs = await diffDir(src.path, dst.path);

      // then
      const result = diffs[0];
      expect(result.status).toBe("changed");
      if (result.status === "changed") {
        expect(result.lines.some((l) => l.startsWith("+"))).toBe(true);
        expect(result.lines.some((l) => l.startsWith("-"))).toBe(true);
        expect(result.summary).toBeTruthy();
      }
    });
  });
}
