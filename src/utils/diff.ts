import { readFile } from "node:fs/promises";
import { parse as parseJsonc } from "jsonc-parser";

export interface DiffResult {
  identical: boolean;
  lines: string[];
  summary: string;
}

// ── Pure diff logic (no I/O) ──────────────────────────────────────────────────

export function diffText(rawA: string | null, rawB: string | null): DiffResult {
  if (rawA === null && rawB === null) {
    return { identical: true, lines: [], summary: "Both files missing" };
  }
  if (rawA === null) {
    // rawB is non-null here: the both-null case returned above
    return {
      identical: false,
      lines: (rawB as string).split("\n").map((l) => `+ ${l}`),
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

export function diffJsonObjects(
  objA: Record<string, unknown> | null,
  objB: Record<string, unknown> | null
): DiffResult {
  if (objA === null || objB === null) {
    // Signal caller to fall back to text diff
    return { identical: false, lines: [], summary: "" };
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

// ── I/O wrappers ──────────────────────────────────────────────────────────────

export async function diffFiles(
  pathA: string,
  pathB: string
): Promise<DiffResult> {
  const [rawA, rawB] = await Promise.all([
    readFile(pathA, "utf-8").catch(() => null),
    readFile(pathB, "utf-8").catch(() => null),
  ]);
  return diffText(rawA, rawB);
}

export async function diffJsonFiles(
  pathA: string,
  pathB: string
): Promise<DiffResult> {
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
  const { describe, it, expect } = import.meta.vitest;
  const { createFixture } = await import("fs-fixture");
  const { join } = await import("node:path");

  // ── diffText (pure, no I/O) ────────────────────────────────────────────────

  describe("diffText", () => {
    it("returns identical=true when both inputs are null", () => {
      // Given: no files on either side
      // When
      const result = diffText(null, null);
      // Then
      expect(result.identical).toBe(true);
      expect(result.summary).toBe("Both files missing");
    });

    it("returns identical=true for equal strings", () => {
      // Given: same content on both sides
      const content = "hello\nworld";
      // When
      const result = diffText(content, content);
      // Then
      expect(result.identical).toBe(true);
    });

    it("shows only + lines when A is null", () => {
      // Given: source is missing, destination exists
      // When
      const result = diffText(null, "line1\nline2");
      // Then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in destination");
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("shows only - lines when B is null", () => {
      // Given: source exists, destination is missing
      // When
      const result = diffText("line1\nline2", null);
      // Then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in source");
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });

    it("shows added and removed lines for different content", () => {
      // Given: content differs between source and destination
      // When
      const result = diffText("hello\nworld", "hello\nearth");
      // Then
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
      expect(result.lines.some((l) => l.startsWith("+"))).toBe(true);
      expect(result.lines.some((l) => l.startsWith("-"))).toBe(true);
    });
  });

  // ── diffJsonObjects (pure, no I/O) ─────────────────────────────────────────

  describe("diffJsonObjects", () => {
    it("returns identical=true for equal objects", () => {
      // Given: same JSON structure on both sides
      const obj = { key: 1, flag: true };
      // When
      const result = diffJsonObjects(obj, obj);
      // Then
      expect(result.identical).toBe(true);
    });

    it("reports added key when only in B", () => {
      // Given: B has an extra key
      // When
      const result = diffJsonObjects({ a: 1 }, { a: 1, b: 2 });
      // Then
      expect(result.identical).toBe(false);
      expect(
        result.lines.some((l) => l.startsWith("+") && l.includes('"b"'))
      ).toBe(true);
    });

    it("reports removed key when only in A", () => {
      // Given: A has a key that B does not
      // When
      const result = diffJsonObjects({ a: 1, old: true }, { a: 1 });
      // Then
      expect(result.identical).toBe(false);
      expect(
        result.lines.some((l) => l.startsWith("-") && l.includes('"old"'))
      ).toBe(true);
    });

    it("reports changed value with - (old) and + (new) lines", () => {
      // Given: shared key has different values
      // When
      const result = diffJsonObjects({ key: 1 }, { key: 2 });
      // Then
      expect(
        result.lines.some((l) => l.startsWith("-") && l.includes('"key"'))
      ).toBe(true);
      expect(
        result.lines.some((l) => l.startsWith("+") && l.includes('"key"'))
      ).toBe(true);
    });

    it("signals fallback when passed null (caller must use text diff)", () => {
      // Given: one side could not be parsed as JSON (represented as null)
      // When
      const result = diffJsonObjects(null, { key: 1 });
      // Then: empty non-identical result tells caller to fall back to text diff
      expect(result.identical).toBe(false);
      expect(result.lines).toHaveLength(0);
      expect(result.summary).toBe("");
    });
  });

  // ── diffFiles / diffJsonFiles (I/O wrappers) ───────────────────────────────

  describe("diffFiles", () => {
    it("returns identical=true for files with equal content", async () => {
      // Given
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nworld",
      });
      // When
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      // Then
      expect(result.identical).toBe(true);
    });

    it("reports differences when file content diverges", async () => {
      // Given
      await using fixture = await createFixture({
        "a.txt": "hello\nworld",
        "b.txt": "hello\nearth",
      });
      // When
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "b.txt")
      );
      // Then
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("reports only + lines when source file does not exist", async () => {
      // Given: A is missing, B exists
      await using fixture = await createFixture({ "b.txt": "hello" });
      // When
      const result = await diffFiles(
        join(fixture.path, "missing.txt"),
        join(fixture.path, "b.txt")
      );
      // Then
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("reports only - lines when destination file does not exist", async () => {
      // Given: A exists, B is missing
      await using fixture = await createFixture({ "a.txt": "hello" });
      // When
      const result = await diffFiles(
        join(fixture.path, "a.txt"),
        join(fixture.path, "missing.txt")
      );
      // Then
      expect(result.identical).toBe(false);
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });

  describe("diffJsonFiles", () => {
    it("returns identical=true for files with equal JSON", async () => {
      // Given
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": '{"key": 1}',
      });
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // Then
      expect(result.identical).toBe(true);
    });

    it("reports key-level differences between JSON files", async () => {
      // Given
      await using fixture = await createFixture({
        "a.json": '{"key": 1, "old": true}',
        "b.json": '{"key": 2, "new": true}',
      });
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // Then
      expect(result.identical).toBe(false);
      expect(result.lines.some((l) => l.includes('"key"'))).toBe(true);
    });

    it("falls back to text diff when one file is not valid JSON", async () => {
      // Given: B is plain text, not parseable as JSON
      await using fixture = await createFixture({
        "a.json": '{"key": 1}',
        "b.json": "not json",
      });
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "b.json")
      );
      // Then: summary uses "line" wording (text diff), not "key" wording
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
    });

    it("returns identical=true when both files are missing", async () => {
      // Given: neither file exists
      await using fixture = await createFixture({});
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "x.json"),
        join(fixture.path, "y.json")
      );
      // Then
      expect(result.identical).toBe(true);
    });

    it("falls back to text diff when source file is missing", async () => {
      // Given: A is missing, B is valid JSON
      await using fixture = await createFixture({ "b.json": '{"key": 1}' });
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "missing.json"),
        join(fixture.path, "b.json")
      );
      // Then: diffText fallback → all lines start with +, summary is text-diff wording
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in destination");
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("falls back to text diff when destination file is missing", async () => {
      // Given: A is valid JSON, B is missing
      await using fixture = await createFixture({ "a.json": '{"key": 1}' });
      // When
      const result = await diffJsonFiles(
        join(fixture.path, "a.json"),
        join(fixture.path, "missing.json")
      );
      // Then: diffText fallback → all lines start with -, summary is text-diff wording
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in source");
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });
  });
}
