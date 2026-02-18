// src/i18n/en.ts
export const messages = {
  // ── Header ──────────────────────────────────────────────
  header_title:        'Claude Config Migration',
  header_global:       'global',
  header_project:      'project',

  // ── File selector ────────────────────────────────────────
  select_file_prompt:  'Select a file to manage:',
  done_option:         '── Done ──',

  // ── Action selector ──────────────────────────────────────
  action_prompt:       'What do you want to do?',
  action_copy:         'Copy',
  action_diff:         'Diff (view differences)',
  action_prompt_gen:   'Generate migration prompt for Claude',
  action_skip:         'Skip',

  // ── Direction selector ───────────────────────────────────
  direction_prompt:    'Direction:',
  direction_p2g:       'project → global',
  direction_g2p:       'global → project',

  // ── Copy ─────────────────────────────────────────────────
  copy_already_exists: 'already exists in',
  copy_changes_apply:  'Changes that would be applied:',
  copy_overwrite_q:    'Overwrite',
  copy_backed_up:      'Backed up to',
  copy_done:           'Copied',
  copy_skipped:        'Skipped.',
  copy_dir_not_supported: 'Directory diff not yet supported — showing file list instead.',

  // ── Diff ─────────────────────────────────────────────────
  diff_summary_label:  'Summary:',

  // ── Migration Prompt ─────────────────────────────────────
  prompt_header:       'Migration Prompt (copy & paste into Claude)',

  // ── General ──────────────────────────────────────────────
  no_files_found:      'No Claude config files found in either location.',
  goodbye:             'Done! 👋',
  skipped:             'Skipped.',
} as const

export type MessageKey = keyof typeof messages
