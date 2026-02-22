import type { messages as enMessages } from "./en.js";

export const messages: Record<keyof typeof enMessages, string> = {
  // ── ヘッダー ──────────────────────────────────────────────
  header_title: "Claude Config マイグレーション",
  header_global: "グローバル",
  header_project: "プロジェクト",

  // ── ファイル選択 ──────────────────────────────────────────
  select_file_prompt: "操作するファイルを選んでください:",
  done_option: "── 完了 ──",

  // ── アクション選択 ────────────────────────────────────────
  action_prompt: "何をしますか？",
  action_copy: "コピー",
  action_diff: "差分表示",
  action_prompt_gen: "Claude 用移行プロンプトを生成",
  action_skip: "スキップ",

  // ── 方向選択 ──────────────────────────────────────────────
  direction_prompt: "方向:",
  direction_p2g: "プロジェクト → グローバル",
  direction_g2p: "グローバル → プロジェクト",

  // ── コピー ────────────────────────────────────────────────
  copy_already_exists: "に既に存在します",
  copy_changes_apply: "適用される変更:",
  copy_overwrite_q: "上書きしますか？",
  copy_backed_up: "バックアップ先:",
  copy_done: "コピー完了",
  copy_skipped: "スキップしました。",
  copy_dir_listing: "コピー元の内容:",

  // ── 差分 ──────────────────────────────────────────────────
  diff_summary_label: "サマリー:",
  diff_dir_src_only: "(コピー元のみ)",
  diff_dir_dst_only: "(コピー先のみ)",

  // ── 移行プロンプト ヘッダー ───────────────────────────────
  prompt_header: "移行プロンプト（Claude にコピー＆ペーストしてください）",

  // ── 移行プロンプト 本文 ───────────────────────────────────
  prompt_from: "移行元",
  prompt_to: "移行先",
  prompt_dir_suffix: "(ディレクトリ)",
  prompt_instructions_heading: "## 指示",
  prompt_dir_is_dir: "このエントリはディレクトリです。",
  prompt_dir_check_files:
    "ディレクトリ内の各ファイルを確認し、必要に応じてマージまたはコピーしてください。",
  prompt_dir_skills_note: "特に `skills/` ディレクトリの場合:",
  prompt_dir_check_skill_md: "- 各スキルの `SKILL.md` を確認してください",
  prompt_dir_merge_dups: "- 重複するスキルがある場合は内容をマージしてください",
  prompt_dir_copy_new: "- 移行先にないスキルはそのままコピーしてください",
  prompt_source_missing: "移行元ファイルが存在しません。",
  prompt_dest_missing_body:
    "移行先にファイルが存在しないため、移行元の内容をそのままコピーしてください。",
  prompt_dest_create_at: "以下のパスに以下の内容で新規作成してください:",
  prompt_source_heading: "## 移行元の現在の内容",
  prompt_dest_heading: "## 移行先の現在の内容",
  prompt_merge_body:
    "上記2つのファイルの内容をマージして、移行先ファイルを更新してください。",
  prompt_merge_notes: "以下の点に注意してください:",
  prompt_merge_note1: "1. 移行元の設定を移行先に適用する",
  prompt_merge_note2: "2. 移行先にしか存在しない設定は保持する",
  prompt_merge_note3:
    "3. 競合する設定は移行元を優先する（確認が必要な場合はコメントを付ける）",
  prompt_merge_note4: "4. JSONの場合はフォーマットを整える",

  // ── 汎用 ──────────────────────────────────────────────────
  no_files_found:
    "どちらのディレクトリにも Claude 設定ファイルが見つかりません。",
  goodbye: "完了！ 👋",
  skipped: "スキップしました。",
  legend_tab: "[Tab] 方向を切り替え",
  legend_keys: "[↑↓] 移動  [C] コピー  [D] 差分  [P] プロンプト  [Q] 終了",
  legend_status: "● = 同期済み  ○ = 内容が異なる",
};
