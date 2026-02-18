// src/i18n/ja.ts
import type { messages as enMessages } from './en.js'

export const messages: Record<keyof typeof enMessages, string> = {
  // ── ヘッダー ──────────────────────────────────────────────
  header_title:        'Claude Config マイグレーション',
  header_global:       'グローバル',
  header_project:      'プロジェクト',

  // ── ファイル選択 ──────────────────────────────────────────
  select_file_prompt:  '操作するファイルを選んでください:',
  done_option:         '── 完了 ──',

  // ── アクション選択 ────────────────────────────────────────
  action_prompt:       '何をしますか？',
  action_copy:         'コピー',
  action_diff:         '差分表示',
  action_prompt_gen:   'Claude 用移行プロンプトを生成',
  action_skip:         'スキップ',

  // ── 方向選択 ──────────────────────────────────────────────
  direction_prompt:    '方向:',
  direction_p2g:       'プロジェクト → グローバル',
  direction_g2p:       'グローバル → プロジェクト',

  // ── コピー ────────────────────────────────────────────────
  copy_already_exists: 'に既に存在します',
  copy_changes_apply:  '適用される変更:',
  copy_overwrite_q:    '上書きしますか？',
  copy_backed_up:      'バックアップ先:',
  copy_done:           'コピー完了',
  copy_skipped:        'スキップしました。',
  copy_dir_not_supported: 'ディレクトリ diff は未対応です — ファイル一覧を表示します。',

  // ── 差分 ──────────────────────────────────────────────────
  diff_summary_label:  'サマリー:',

  // ── 移行プロンプト ────────────────────────────────────────
  prompt_header:       '移行プロンプト（Claude にコピー＆ペーストしてください）',

  // ── 汎用 ──────────────────────────────────────────────────
  no_files_found:      'どちらのディレクトリにも Claude 設定ファイルが見つかりません。',
  goodbye:             '完了！ 👋',
  skipped:             'スキップしました。',
}
