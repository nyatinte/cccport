import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const pathExists = (p: string): Promise<boolean> =>
  stat(p)
    .then(() => true)
    .catch(() => false);

/** Top-level directories whose immediate children should be listed */
export const RECURSE_DIRS = new Set([
  "agents",
  "skills",
  "commands",
  "hooks",
  "rules",
]);

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
        // Recurse one level into known Claude Code container directories
        const parts = rel.split("/");
        if (parts.length === 1 && RECURSE_DIRS.has(rel)) {
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
