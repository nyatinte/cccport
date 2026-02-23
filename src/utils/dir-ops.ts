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
  const srcEntries = await readdir(src, { withFileTypes: true }).catch(
    () => []
  );
  const dstEntries = await readdir(dst, { withFileTypes: true }).catch(
    () => []
  );
  const srcMap = new Map(srcEntries.map((e) => [e.name, e]));
  const dstMap = new Map(dstEntries.map((e) => [e.name, e]));
  const allNames = new Set([...srcMap.keys(), ...dstMap.keys()]);

  const results: DirFileDiff[] = [];
  for (const name of allNames) {
    if (!srcMap.has(name)) {
      results.push({ name, status: "dst-only" });
      continue;
    }
    if (!dstMap.has(name)) {
      results.push({ name, status: "src-only" });
      continue;
    }
    const srcEntry = srcMap.get(name);
    if (srcEntry?.isDirectory()) {
      const subDiffs = await diffDir(join(src, name), join(dst, name));
      if (subDiffs.every((d) => d.status === "identical")) {
        results.push({ name, status: "identical" });
      } else {
        const lines = subDiffs
          .filter((d) => d.status !== "identical")
          .map((d) => `  ${d.name} (${d.status})`);
        results.push({
          name,
          status: "changed",
          lines,
          summary: "Subdirectory has changes",
        });
      }
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

export const dirSyncStatus = async (
  src: string,
  dst: string
): Promise<"synced" | "diverged"> => {
  const diffs = await diffDir(src, dst);
  return diffs.every((d) => d.status === "identical") ? "synced" : "diverged";
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

    it("recursively copies subdirectory contents", async () => {
      // given
      const { readFile: fsReadFile } = await import("node:fs/promises");
      await using src = await createFixture({
        "SKILL.md": "# commit skill",
        "scripts/run.sh": "echo hello",
        "references/guide.md": "# guide",
      });
      await using dst = await createFixture({});
      const dstPath = pathJoin(dst.path, "commit");

      // when
      await copyDir(src.path, dstPath);

      // then
      expect(
        await fsReadFile(pathJoin(dstPath, "scripts/run.sh"), "utf8")
      ).toBe("echo hello");
      expect(
        await fsReadFile(pathJoin(dstPath, "references/guide.md"), "utf8")
      ).toBe("# guide");
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

    it("reports identical for a subdirectory with matching content", async () => {
      // given
      await using src = await createFixture({
        "scripts/run.sh": "echo hi",
      });
      await using dst = await createFixture({
        "scripts/run.sh": "echo hi",
      });
      // when
      const diffs = await diffDir(src.path, dst.path);
      // then
      expect(diffs).toEqual([{ name: "scripts", status: "identical" }]);
    });

    it("reports changed for a subdirectory with differing content", async () => {
      // given
      await using src = await createFixture({
        "scripts/run.sh": "echo global",
      });
      await using dst = await createFixture({
        "scripts/run.sh": "echo project",
      });
      // when
      const diffs = await diffDir(src.path, dst.path);
      // then
      const result = diffs.find((d) => d.name === "scripts");
      expect(result?.status).toBe("changed");
    });

    it("reports src-only for a subdirectory that exists only in src", async () => {
      // given
      await using src = await createFixture({ "scripts/run.sh": "echo hi" });
      await using dst = await createFixture({});
      // when
      const diffs = await diffDir(src.path, dst.path);
      // then
      expect(diffs).toEqual([{ name: "scripts", status: "src-only" }]);
    });
  });

  describe(dirSyncStatus, () => {
    it("returns synced when both directories have identical content", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "# skill" });
      await using dst = await createFixture({ "SKILL.md": "# skill" });
      // when / then
      expect(await dirSyncStatus(src.path, dst.path)).toBe("synced");
    });

    it("returns diverged when file content differs", async () => {
      // given
      await using src = await createFixture({ "SKILL.md": "global" });
      await using dst = await createFixture({ "SKILL.md": "project" });
      // when / then
      expect(await dirSyncStatus(src.path, dst.path)).toBe("diverged");
    });

    it("returns diverged when a file exists only in src", async () => {
      // given
      await using src = await createFixture({
        "SKILL.md": "x",
        "extra.sh": "echo hi",
      });
      await using dst = await createFixture({ "SKILL.md": "x" });
      // when / then
      expect(await dirSyncStatus(src.path, dst.path)).toBe("diverged");
    });

    it("returns diverged when subdirectory content differs", async () => {
      // given
      await using src = await createFixture({
        "references/guide.md": "global version",
      });
      await using dst = await createFixture({
        "references/guide.md": "project version",
      });
      // when / then
      expect(await dirSyncStatus(src.path, dst.path)).toBe("diverged");
    });

    it("returns synced when subdirectory content is identical", async () => {
      // given
      await using src = await createFixture({
        "SKILL.md": "# skill",
        "scripts/run.sh": "echo hi",
      });
      await using dst = await createFixture({
        "SKILL.md": "# skill",
        "scripts/run.sh": "echo hi",
      });
      // when / then
      expect(await dirSyncStatus(src.path, dst.path)).toBe("synced");
    });
  });
}
