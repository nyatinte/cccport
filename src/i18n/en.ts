export const messages = {
  // ── Header ──────────────────────────────────────────────
  header_title: "Claude Config Migration",
  header_global: "global",
  header_project: "project",

  // ── File selector ────────────────────────────────────────
  select_file_prompt: "Select a file to manage:",
  done_option: "── Done ──",

  // ── Action selector ──────────────────────────────────────
  action_prompt: "What do you want to do?",
  action_copy: "Copy",
  action_diff: "Diff (view differences)",
  action_prompt_gen: "Generate migration prompt for Claude",
  action_skip: "Skip",

  // ── Direction selector ───────────────────────────────────
  direction_prompt: "Direction:",
  direction_p2g: "project → global",
  direction_g2p: "global → project",

  // ── Copy ─────────────────────────────────────────────────
  copy_already_exists: "already exists in",
  copy_changes_apply: "Changes that would be applied:",
  copy_overwrite_q: "Overwrite",
  copy_backed_up: "Backed up to",
  copy_done: "Copied",
  copy_skipped: "Skipped.",
  copy_dir_not_supported:
    "Directory diff not yet supported — showing file list instead.",

  // ── Diff ─────────────────────────────────────────────────
  diff_summary_label: "Summary:",

  // ── Migration Prompt header ───────────────────────────────
  prompt_header: "Migration Prompt (copy & paste into Claude)",

  // ── Migration Prompt content ──────────────────────────────
  prompt_from: "From",
  prompt_to: "To",
  prompt_dir_suffix: "(directory)",
  prompt_instructions_heading: "## Instructions",
  prompt_dir_is_dir: "This entry is a directory.",
  prompt_dir_check_files:
    "Check each file in the directory and merge or copy as needed.",
  prompt_dir_skills_note: "For `skills/` directories:",
  prompt_dir_check_skill_md: "- Check each skill's `SKILL.md`",
  prompt_dir_merge_dups: "- Merge duplicate skills",
  prompt_dir_copy_new: "- Copy skills not present in destination",
  prompt_source_missing: "Source file does not exist.",
  prompt_dest_missing_body:
    "Destination does not exist. Copy the source content as-is.",
  prompt_dest_create_at:
    "Create a new file at the path below with the following content:",
  prompt_source_heading: "## Source Content",
  prompt_dest_heading: "## Destination Content",
  prompt_merge_body:
    "Merge the two files above and update the destination file.",
  prompt_merge_notes: "Notes:",
  prompt_merge_note1: "1. Apply source settings to destination",
  prompt_merge_note2: "2. Retain settings that only exist in destination",
  prompt_merge_note3:
    "3. Prefer source on conflicts (add a comment if unclear)",
  prompt_merge_note4: "4. Format JSON if applicable",

  // ── General ──────────────────────────────────────────────
  no_files_found: "No Claude config files found in either location.",
  goodbye: "Done! 👋",
  skipped: "Skipped.",
} as const;

export type MessageKey = keyof typeof messages;
