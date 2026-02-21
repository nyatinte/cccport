import { readFile } from "node:fs/promises";
import type { DiffResult } from "./core.js";
import { diffJsonObjects, diffText } from "./core.js";

const safeParseJson = (raw: string): Record<string, unknown> | null => {
  try {
    const result: unknown = JSON.parse(raw);
    if (
      typeof result !== "object" ||
      result === null ||
      Array.isArray(result)
    ) {
      return null;
    }
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const diffFiles = async (
  pathA: string,
  pathB: string
): Promise<DiffResult> => {
  const [rawA, rawB] = await Promise.all([
    readFile(pathA, "utf-8").catch(() => null),
    readFile(pathB, "utf-8").catch(() => null),
  ]);
  return diffText(rawA, rawB);
};

export const diffJsonFiles = async (
  pathA: string,
  pathB: string
): Promise<DiffResult> => {
  const [rawA, rawB] = await Promise.all([
    readFile(pathA, "utf-8").catch(() => null),
    readFile(pathB, "utf-8").catch(() => null),
  ]);

  if (rawA === null && rawB === null) {
    return {
      identical: true,
      lines: [],
      summary: "Both files missing or invalid JSON",
    };
  }

  const objA = rawA ? safeParseJson(rawA) : null;
  const objB = rawB ? safeParseJson(rawB) : null;

  // Fall back to text diff when either side is unparseable
  if (objA === null || objB === null) {
    return diffText(rawA, rawB);
  }

  return diffJsonObjects(objA, objB);
};

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { createFixture } = await import("fs-fixture");
  const { join } = await import("node:path");

  describe(diffFiles, () => {
    it("returns identical=true for files with equal content", async () => {
      // given
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nworld",
      });
      // when
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      // then
      expect(result.identical).toBe(true);
    });

    it("reports differences when file content diverges", async () => {
      // given
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nearth",
      });
      // when
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("reports only + lines when source file does not exist", async () => {
      // given
      await using fixture = await createFixture({ "b.txt": "hello" });
      // when
      const result = await diffFiles(
        join(fixture.path, "missing.txt"),
        join(fixture.path, "b.txt")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("reports only - lines when destination file does not exist", async () => {
      // given
      await using fixture = await createFixture({ "a.txt": "hello" });
      // when
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "missing.txt")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });

  describe(diffJsonFiles, () => {
    it("returns identical=true for files with equal JSON", async () => {
      // given
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": '{"key": 1}',
      });
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // then
      expect(result.identical).toBe(true);
    });

    it("reports key-level differences between JSON files", async () => {
      // given
      await using fixture = await createFixture({
        "a.json": '{"key": 1, "old": true}',
        "b.json": '{"key": 2, "new": true}',
      });
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.lines.some((l) => l.includes('"key"'))).toBe(true);
    });

    it("falls back to text diff when one file is not valid JSON", async () => {
      // given
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": "not json",
      });
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("returns identical=true when both files are missing", async () => {
      // given
      await using fixture = await createFixture({});
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "x.json"),
        join(fixture.path, "y.json")
      );
      // then
      expect(result.identical).toBe(true);
    });

    it("falls back to text diff when source file is missing", async () => {
      // given
      await using fixture = await createFixture({ "b.json": '{"key": 1}' });
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "missing.json"),
        join(fixture.path, "b.json")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in destination");
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("falls back to text diff when destination file is missing", async () => {
      // given
      await using fixture = await createFixture({ "a.json": '{"key": 1}' });
      // when
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "missing.json")
      );
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in source");
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });
}
