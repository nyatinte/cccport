import { cp, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { diffFiles, diffJsonFiles } from "./diff/files.js";
import { pathExists } from "./scanner/walk.js";

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
  let backupPath: string | null = null;
  if (await pathExists(dst)) {
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
    const diff = name.endsWith(".json")
      ? await diffJsonFiles(join(src, name), join(dst, name))
      : await diffFiles(join(src, name), join(dst, name));
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

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { join: pathJoin } = await import("node:path");
  const { cp: fsCp } = await import("node:fs/promises");
  const { createFixture } = await import("fs-fixture");
  const { readdir: fsReaddir } = await import("node:fs/promises");

  describe(copyDir, () => {
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
      await fsCp(src.path, dstPath, { recursive: true });

      // when
      const { backupPath } = await copyDir(src.path, dstPath);

      // then
      expect(backupPath).not.toBeNull();
      expect(backupPath).toContain(".bak.");
      const backupFiles = await fsReaddir(backupPath as string);
      expect(backupFiles).toContain("SKILL.md");
    });
  });

  describe(diffDir, () => {
    it("reports src-only for a file that exists only in src", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# skill" });
      await using dst = await createFixture({});

      // when / then
      expect(await diffDir(src.path, dst.path)).toEqual([
        { name: "SKILL.md", status: "src-only" },
      ]);
    });

    it("reports dst-only for a file that exists only in dst", async () => {
      // given
      await using src = await createFixture({});
      await using dst = await createFixture({ "SKILL.md": "# skill" });

      // when / then
      expect(await diffDir(src.path, dst.path)).toEqual([
        { name: "SKILL.md", status: "dst-only" },
      ]);
    });

    it("reports identical for matching files", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# skill" });
      await using dst = await createFixture({ "SKILL.md": "# skill" });

      // when / then
      expect(await diffDir(src.path, dst.path)).toEqual([
        { name: "SKILL.md", status: "identical" },
      ]);
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
