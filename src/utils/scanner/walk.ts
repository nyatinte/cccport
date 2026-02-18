import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const pathExists = (p: string): Promise<boolean> =>
  stat(p)
    .then(() => true)
    .catch(() => false);

export const walkClaudeDir = async (root: string): Promise<string[]> => {
  if (!(await pathExists(root))) {
    return [];
  }

  const results: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs);
      if (entry.isDirectory()) {
        results.push(`${rel}/`);
        // Only recurse one level into skills/ — individual skill dirs are the leaf nodes
        if (rel === "skills") {
          await walk(abs);
        }
      } else {
        results.push(rel);
      }
    }
  };

  await walk(root);
  return results;
};
