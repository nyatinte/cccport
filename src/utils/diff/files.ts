import { readFile } from "node:fs/promises";
import { parse as parseJsonc } from "jsonc-parser";
import type { DiffResult } from "./core.js";
import { diffJsonObjects, diffText } from "./core.js";

const parseJsoncSafe = (raw: string): Record<string, unknown> | null => {
  const errors: unknown[] = [];
  const result = parseJsonc(raw, errors);
  if (
    errors.length > 0 ||
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result)
  ) {
    return null;
  }
  return result as Record<string, unknown>;
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

  const objA = rawA ? parseJsoncSafe(rawA) : null;
  const objB = rawB ? parseJsoncSafe(rawB) : null;

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

  describe("diffFiles", () => {
    it("returns identical=true for files with equal content", async () => {
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nworld",
      });
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      expect(result.identical).toBe(true);
    });

    it("reports differences when file content diverges", async () => {
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nearth",
      });
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("reports only + lines when source file does not exist", async () => {
      await using fixture = await createFixture({ "b.txt": "hello" });
      const result = await diffFiles(
        join(fixture.path, "missing.txt"),
        join(fixture.path, "b.txt")
      );
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("reports only - lines when destination file does not exist", async () => {
      await using fixture = await createFixture({ "a.txt": "hello" });
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "missing.txt")
      );
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });

  describe("diffJsonFiles", () => {
    it("returns identical=true for files with equal JSON", async () => {
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": '{"key": 1}',
      });
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      expect(result.identical).toBe(true);
    });

    it("reports key-level differences between JSON files", async () => {
      await using fixture = await createFixture({
        "a.json": '{"key": 1, "old": true}',
        "b.json": '{"key": 2, "new": true}',
      });
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      expect(result.identical).toBe(false);
      expect(result.lines.some((l) => l.includes('"key"'))).toBe(true);
    });

    it("falls back to text diff when one file is not valid JSON", async () => {
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": "not json",
      });
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("returns identical=true when both files are missing", async () => {
      await using fixture = await createFixture({});
      const result = await diffJsonFiles(
        join(fixture.path, "x.json"),
        join(fixture.path, "y.json")
      );
      expect(result.identical).toBe(true);
    });

    it("falls back to text diff when source file is missing", async () => {
      await using fixture = await createFixture({ "b.json": '{"key": 1}' });
      const result = await diffJsonFiles(
        join(fixture.path, "missing.json"),
        join(fixture.path, "b.json")
      );
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in destination");
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("falls back to text diff when destination file is missing", async () => {
      await using fixture = await createFixture({ "a.json": '{"key": 1}' });
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "missing.json")
      );
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in source");
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });
}
