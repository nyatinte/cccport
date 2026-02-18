import { readFile } from "node:fs/promises";
import { parse as parseJsonc } from "jsonc-parser";

export interface DiffResult {
  identical: boolean;
  lines: string[];
  summary: string;
}

export async function diffFiles(
  pathA: string,
  pathB: string
): Promise<DiffResult> {
  const [rawA, rawB] = await Promise.all([
    readFile(pathA, "utf-8").catch(() => null),
    readFile(pathB, "utf-8").catch(() => null),
  ]);

  if (rawA === null && rawB === null) {
    return { identical: true, lines: [], summary: "Both files missing" };
  }
  if (rawA === null) {
    return {
      identical: false,
      lines: (rawB ?? "").split("\n").map((l) => `+ ${l}`),
      summary: "Only exists in destination",
    };
  }
  if (rawB === null) {
    return {
      identical: false,
      lines: rawA.split("\n").map((l) => `- ${l}`),
      summary: "Only exists in source",
    };
  }
  if (rawA === rawB) {
    return { identical: true, lines: [], summary: "Files are identical" };
  }

  const setA = new Set(rawA.split("\n"));
  const setB = new Set(rawB.split("\n"));
  const lines = [
    ...rawA
      .split("\n")
      .filter((l) => !setB.has(l))
      .map((l) => `- ${l}`),
    ...rawB
      .split("\n")
      .filter((l) => !setA.has(l))
      .map((l) => `+ ${l}`),
  ];
  const added = lines.filter((l) => l.startsWith("+")).length;
  const removed = lines.filter((l) => l.startsWith("-")).length;

  return {
    identical: false,
    lines,
    summary: `${added} line(s) added, ${removed} line(s) removed`,
  };
}

export async function diffJsonFiles(
  pathA: string,
  pathB: string
): Promise<DiffResult> {
  const [rawA, rawB] = await Promise.all([
    readFile(pathA, "utf-8").catch(() => null),
    readFile(pathB, "utf-8").catch(() => null),
  ]);

  const objA = rawA ? parseJsoncSafe(rawA) : null;
  const objB = rawB ? parseJsoncSafe(rawB) : null;

  if (objA === null && objB === null) {
    return {
      identical: true,
      lines: [],
      summary: "Both files missing or invalid JSON",
    };
  }
  if (objA === null || objB === null) {
    return diffFiles(pathA, pathB);
  }

  const lines: string[] = [];
  for (const key of new Set([...Object.keys(objA), ...Object.keys(objB)])) {
    const valA = JSON.stringify(objA[key]);
    const valB = JSON.stringify(objB[key]);
    if (!(key in objA)) {
      lines.push(`+ "${key}": ${valB}`);
    } else if (!(key in objB)) {
      lines.push(`- "${key}": ${valA}`);
    } else if (valA !== valB) {
      lines.push(`- "${key}": ${valA}`);
      lines.push(`+ "${key}": ${valB}`);
    }
  }

  if (lines.length === 0) {
    return { identical: true, lines: [], summary: "Files are identical" };
  }

  const added = lines.filter((l) => l.startsWith("+")).length;
  const removed = lines.filter((l) => l.startsWith("-")).length;
  return {
    identical: false,
    lines,
    summary: `${added} key(s) added/changed, ${removed} key(s) removed/changed`,
  };
}

function parseJsoncSafe(raw: string): Record<string, unknown> | null {
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
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, beforeEach, afterEach } = import.meta.vitest;
  const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp("/tmp/cccport-diff-");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  describe("diffFiles", () => {
    it("identical files → identical=true", async () => {
      const a = join(tmpDir, "a.txt");
      const b = join(tmpDir, "b.txt");
      await writeFile(a, "hello\nworld");
      await writeFile(b, "hello\nworld");
      const result = await diffFiles(a, b);
      expect(result.identical).toBe(true);
    });

    it("different files → identical=false with summary", async () => {
      const a = join(tmpDir, "a.txt");
      const b = join(tmpDir, "b.txt");
      await writeFile(a, "hello\nworld");
      await writeFile(b, "hello\nearth");
      const result = await diffFiles(a, b);
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("missing file A → reports only-in-destination", async () => {
      const a = join(tmpDir, "missing.txt");
      const b = join(tmpDir, "b.txt");
      await writeFile(b, "hello");
      const result = await diffFiles(a, b);
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });
  });

  describe("diffJsonFiles", () => {
    it("identical JSON → identical=true", async () => {
      const a = join(tmpDir, "a.json");
      const b = join(tmpDir, "b.json");
      await writeFile(a, '{"key": 1}');
      await writeFile(b, '{"key": 1}');
      const result = await diffJsonFiles(a, b);
      expect(result.identical).toBe(true);
    });

    it("different JSON keys → reports differences", async () => {
      const a = join(tmpDir, "a.json");
      const b = join(tmpDir, "b.json");
      await writeFile(a, '{"key": 1, "old": true}');
      await writeFile(b, '{"key": 2, "new": true}');
      const result = await diffJsonFiles(a, b);
      expect(result.identical).toBe(false);
      expect(result.lines.some((l) => l.includes("key"))).toBe(true);
    });
  });
}
