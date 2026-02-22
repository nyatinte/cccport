import { Box, Text, useApp, useInput, useStdout } from "ink";
import type React from "react";
import { useState } from "react";
import { t } from "../i18n/index.js";
import type { ClaudeFile, ScanResult } from "../types.js";
import type { Action, Direction } from "./types.js";

export interface AppSelection {
  action: Exclude<Action, "skip">;
  direction: Direction;
  file: ClaudeFile;
}

// ── Panel ──────────────────────────────────────────────────────────────────

const NAME_WIDTH = 24;

const basename = (rel: string): string => {
  const slash = rel.lastIndexOf("/");
  return slash === -1 ? rel : rel.slice(slash + 1);
};

interface FileGroup {
  entries: { file: ClaudeFile; idx: number }[];
  groupName: string | null;
}

const groupFiles = (files: ClaudeFile[]): FileGroup[] => {
  const groups: FileGroup[] = [];
  let current: FileGroup | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) {
      continue;
    }
    const slash = file.relativePath.indexOf("/");
    const groupName = slash === -1 ? null : file.relativePath.slice(0, slash);

    if (current === null || current.groupName !== groupName) {
      current = { groupName, entries: [] };
      groups.push(current);
    }
    current.entries.push({ file, idx: i });
  }

  return groups;
};

interface PanelProps {
  cursor: number;
  files: ClaudeFile[];
  isActive: boolean;
  root: string;
  title: string;
  width: number;
}

const Panel: React.FC<PanelProps> = ({
  title,
  root,
  files,
  cursor,
  isActive,
  width,
}) => {
  const groups = groupFiles(files);

  return (
    <Box
      borderColor={isActive ? "cyan" : "gray"}
      borderStyle="round"
      flexDirection="column"
      paddingX={1}
      width={width}
    >
      <Text bold color={isActive ? "cyan" : "gray"}>
        {title}
      </Text>
      <Text dimColor wrap="truncate">
        {root}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {groups.map((group) => (
          <Box flexDirection="column" key={group.groupName ?? "__top__"}>
            {group.groupName && (
              <Box marginTop={1}>
                <Text dimColor>{`── ${group.groupName} ──`}</Text>
              </Box>
            )}
            {group.entries.map(({ file, idx }) => {
              const active = idx === cursor;
              const raw = basename(file.relativePath);
              const name =
                raw.length > NAME_WIDTH
                  ? `${raw.slice(0, NAME_WIDTH - 1)}…`
                  : raw.padEnd(NAME_WIDTH);
              const [marker, markerColor] =
                file.syncStatus === "synced"
                  ? ([" ●", "green"] as const)
                  : file.syncStatus === "diverged"
                    ? ([" ○", "yellow"] as const)
                    : (["  ", "gray"] as const);
              return (
                <Box key={file.relativePath}>
                  <Text color="cyan">{active && isActive ? "▶ " : "  "}</Text>
                  <Text bold={active} inverse={active && isActive}>
                    {file.isDirectory ? "▸ " : "  "}
                    {name}
                  </Text>
                  <Text color={markerColor}>{marker}</Text>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// ── App ────────────────────────────────────────────────────────────────────

interface AppProps {
  onAction: (sel: AppSelection | null) => void;
  scan: ScanResult;
}

// Minimum usable panel width: border(2) + paddingX(2) + cursor(2) + icon(2) + name + status(2)
const MIN_PANEL_WIDTH = NAME_WIDTH + 12;

export const App: React.FC<AppProps> = ({ scan, onAction }) => {
  const [cursor, setCursor] = useState({ global: 0, project: 0 });
  const [side, setSide] = useState<"global" | "project">("global");
  const { exit } = useApp();
  const { stdout } = useStdout();

  // Derive panel width from live terminal columns so the layout never wraps
  // when the user resizes the window. Ink re-renders on SIGWINCH and stdout.columns
  // reflects the new size, preventing stale-height ghost lines.
  const panelWidth = Math.max(
    MIN_PANEL_WIDTH,
    Math.floor((stdout.columns - 1) / 2)
  );

  const globalFiles = scan.files.filter((f) => f.existsGlobal);
  const projectFiles = scan.files.filter((f) => f.existsProject);

  const trigger = (action: Exclude<Action, "skip">) => {
    const activeFiles = side === "global" ? globalFiles : projectFiles;
    const file = activeFiles[cursor[side]];
    if (!file) {
      return;
    }
    const direction: Direction = side === "global" ? "g2p" : "p2g";
    onAction({ file, action, direction });
    exit();
  };

  useInput((input, key) => {
    const activeFiles = side === "global" ? globalFiles : projectFiles;
    if (key.upArrow) {
      setCursor((c) => ({ ...c, [side]: Math.max(0, c[side] - 1) }));
    } else if (key.downArrow && activeFiles.length > 0) {
      setCursor((c) => ({
        ...c,
        [side]: Math.min(activeFiles.length - 1, c[side] + 1),
      }));
    } else if (key.tab) {
      setSide((s) => (s === "global" ? "project" : "global"));
    } else if (input === "q" || input === "Q" || key.escape) {
      onAction(null);
      exit();
    } else if (input === "c" || input === "C") {
      trigger("copy");
    } else if (input === "d" || input === "D") {
      trigger("diff");
    } else if (input === "p" || input === "P") {
      trigger("prompt");
    }
  });

  const dirLabel = side === "global" ? t("direction_g2p") : t("direction_p2g");
  const allEmpty = globalFiles.length === 0 && projectFiles.length === 0;

  return (
    <Box flexDirection="column">
      <Text bold>
        {"━━━ "}
        {t("header_title")}
        {"━".repeat(42)}
      </Text>

      {allEmpty ? (
        <Box marginTop={1}>
          <Text color="yellow">{t("no_files_found")}</Text>
        </Box>
      ) : (
        <Box flexDirection="row" gap={1}>
          <Panel
            cursor={cursor.global}
            files={globalFiles}
            isActive={side === "global"}
            root={scan.globalRoot}
            title={t("header_global")}
            width={panelWidth}
          />
          <Panel
            cursor={cursor.project}
            files={projectFiles}
            isActive={side === "project"}
            root={scan.projectRoot}
            title={t("header_project")}
            width={panelWidth}
          />
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="cyan">{"⟹  "}</Text>
          <Text bold>{dirLabel}</Text>
          <Text dimColor>{`   ${t("legend_tab")}`}</Text>
        </Box>
        <Text dimColor>{`   ${t("legend_keys")}`}</Text>
        <Text dimColor>{`   ${t("legend_status")}`}</Text>
      </Box>
    </Box>
  );
};
