import { Box, Text, useApp, useInput } from "ink";
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

interface PanelProps {
  cursor: number;
  files: ClaudeFile[];
  isActive: boolean;
  root: string;
  side: "global" | "project";
  title: string;
}

const Panel: React.FC<PanelProps> = ({
  title,
  root,
  files,
  cursor,
  isActive,
  side,
}) => (
  <Box
    borderColor={isActive ? "cyan" : "gray"}
    borderStyle="round"
    flexDirection="column"
    minWidth={NAME_WIDTH + 12}
    paddingX={1}
  >
    <Text bold color={isActive ? "cyan" : "gray"}>
      {title}
    </Text>
    <Text dimColor>{root}</Text>
    <Box flexDirection="column" marginTop={1}>
      {files.map((file, i) => {
        const exists =
          side === "global" ? file.existsGlobal : file.existsProject;
        const active = i === cursor;
        const name =
          file.relativePath.length > NAME_WIDTH
            ? `${file.relativePath.slice(0, NAME_WIDTH - 1)}…`
            : file.relativePath.padEnd(NAME_WIDTH);
        return (
          <Box key={file.relativePath}>
            <Text color="cyan">{active && isActive ? "▶ " : "  "}</Text>
            <Text bold={active} dimColor={!exists} inverse={active && isActive}>
              {file.isDirectory ? "▸ " : "  "}
              {name}
            </Text>
            <Text color={exists ? "green" : "red"}>{exists ? " ✓" : " ✗"}</Text>
          </Box>
        );
      })}
    </Box>
  </Box>
);

// ── App ────────────────────────────────────────────────────────────────────

interface AppProps {
  onAction: (sel: AppSelection | null) => void;
  scan: ScanResult;
}

export const App: React.FC<AppProps> = ({ scan, onAction }) => {
  const [cursor, setCursor] = useState(0);
  const [side, setSide] = useState<"global" | "project">("global");
  const { exit } = useApp();

  const files = scan.files;

  const trigger = (action: Exclude<Action, "skip">) => {
    const file = files[cursor];
    if (!file) {
      return;
    }
    const direction: Direction = side === "global" ? "g2p" : "p2g";
    onAction({ file, action, direction });
    exit();
  };

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((c) => Math.max(0, c - 1));
    } else if (key.downArrow) {
      setCursor((c) => Math.min(files.length - 1, c + 1));
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

  return (
    <Box flexDirection="column">
      <Text bold>
        {"━━━ "}
        {t("header_title")}
        {"━".repeat(42)}
      </Text>

      {files.length === 0 ? (
        <Box marginTop={1}>
          <Text color="yellow">{t("no_files_found")}</Text>
        </Box>
      ) : (
        <Box flexDirection="row" gap={1}>
          <Panel
            cursor={cursor}
            files={files}
            isActive={side === "global"}
            root={scan.globalRoot}
            side="global"
            title={t("header_global")}
          />
          <Panel
            cursor={cursor}
            files={files}
            isActive={side === "project"}
            root={scan.projectRoot}
            side="project"
            title={t("header_project")}
          />
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Box>
          <Text color="cyan">{"⟹  "}</Text>
          <Text bold>{dirLabel}</Text>
          <Text dimColor>{"   [Tab] switch direction"}</Text>
        </Box>
        <Text dimColor>
          {"   [↑↓] move  [C] copy  [D] diff  [P] prompt  [Q] quit"}
        </Text>
      </Box>
    </Box>
  );
};
