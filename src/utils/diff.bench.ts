import { bench, describe } from "vitest";
import { diffJsonObjects, diffText } from "./diff/core.js";

const SMALL_A = "hello\nworld\nfoo\nbar\nbaz";
const SMALL_B = "hello\nearth\nfoo\nqux\nbaz";

const LINES_1K = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
const LINES_1K_CHANGED = LINES_1K.replace("line 500", "line five-hundred");

const OBJ_10 = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`key${i}`, i])
);
const OBJ_10_CHANGED = { ...OBJ_10, key5: "changed", newKey: true };

const OBJ_100 = Object.fromEntries(
  Array.from({ length: 100 }, (_, i) => [`key${i}`, i])
);
const OBJ_100_CHANGED = { ...OBJ_100, key50: "changed" };

describe("diffText", () => {
  bench("identical (short-circuit)", () => {
    diffText(SMALL_A, SMALL_A);
  });

  bench("both null", () => {
    diffText(null, null);
  });

  bench("A null (only in dest)", () => {
    diffText(null, SMALL_A);
  });

  bench("small diff (5 lines)", () => {
    diffText(SMALL_A, SMALL_B);
  });

  bench("large diff (1 000 lines, 1 change)", () => {
    diffText(LINES_1K, LINES_1K_CHANGED);
  });
});

describe("diffJsonObjects", () => {
  bench("identical objects (10 keys)", () => {
    diffJsonObjects(OBJ_10, OBJ_10);
  });

  bench("1 key added + 1 changed (10 keys)", () => {
    diffJsonObjects(OBJ_10, OBJ_10_CHANGED);
  });

  bench("1 key changed (100 keys)", () => {
    diffJsonObjects(OBJ_100, OBJ_100_CHANGED);
  });

  bench("null sentinel (immediate return)", () => {
    diffJsonObjects(null, OBJ_10);
  });
});
