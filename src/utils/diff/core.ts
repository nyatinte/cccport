export interface DiffResult {
  identical: boolean;
  lines: string[];
  summary: string;
}

export const diffText = (
  rawA: string | null,
  rawB: string | null
): DiffResult => {
  if (rawA === null && rawB === null) {
    return { identical: true, lines: [], summary: "Both files missing" };
  }
  if (rawA === null) {
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
};

export const diffJsonObjects = (
  objA: Record<string, unknown>,
  objB: Record<string, unknown>
): DiffResult => {
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
};

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe(diffText, () => {
    it("returns identical=true when both inputs are null", () => {
      // when
      const result = diffText(null, null);
      // then
      expect(result.identical).toBe(true);
      expect(result.summary).toBe("Both files missing");
    });

    it("returns identical=true for equal strings", () => {
      // given
      const content = "hello\nworld";
      // when
      const result = diffText(content, content);
      // then
      expect(result.identical).toBe(true);
    });

    it("shows only + lines when A is null", () => {
      // when
      const result = diffText(null, "line1\nline2");
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in destination");
      expect(result.lines.every((l) => l.startsWith("+"))).toBe(true);
    });

    it("shows only - lines when B is null", () => {
      // when
      const result = diffText("line1\nline2", null);
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toBe("Only exists in source");
      expect(result.lines.every((l) => l.startsWith("-"))).toBe(true);
    });

    it("shows added and removed lines for different content", () => {
      // when
      const result = diffText("hello\nworld", "hello\nearth");
      // then
      expect(result.identical).toBe(false);
      expect(result.summary).toContain("line");
      expect(result.lines.some((l) => l.startsWith("+"))).toBe(true);
      expect(result.lines.some((l) => l.startsWith("-"))).toBe(true);
    });
  });

  describe(diffJsonObjects, () => {
    it("returns identical=true for equal objects", () => {
      // given
      const obj = { key: 1, flag: true };
      // when / then
      expect(diffJsonObjects(obj, obj).identical).toBe(true);
    });

    it("reports added key when only in B", () => {
      // when
      const result = diffJsonObjects({ a: 1 }, { a: 1, b: 2 });
      // then
      expect(result.identical).toBe(false);
      expect(
        result.lines.some((l) => l.startsWith("+") && l.includes('"b"'))
      ).toBe(true);
    });

    it("reports removed key when only in A", () => {
      // when
      const result = diffJsonObjects({ a: 1, old: true }, { a: 1 });
      // then
      expect(result.identical).toBe(false);
      expect(
        result.lines.some((l) => l.startsWith("-") && l.includes('"old"'))
      ).toBe(true);
    });

    it("reports changed value with - (old) and + (new) lines", () => {
      // when
      const result = diffJsonObjects({ key: 1 }, { key: 2 });
      // then
      expect(
        result.lines.some((l) => l.startsWith("-") && l.includes('"key"'))
      ).toBe(true);
      expect(
        result.lines.some((l) => l.startsWith("+") && l.includes('"key"'))
      ).toBe(true);
    });
  });
}
