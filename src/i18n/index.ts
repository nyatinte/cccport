export type Locale = "en" | "ja";
export type Messages = typeof import("./en.js").messages;

/**
 * Detect locale from environment variables.
 * Priority: CLAUDE_CONFIG_LANG > LANG > LC_ALL > LC_MESSAGES > 'en'
 */
export function detectLocale(): Locale {
  const candidates = [
    process.env.CLAUDE_CONFIG_LANG,
    process.env.LANG,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
  ];
  for (const c of candidates) {
    if (!c) {
      continue;
    }
    if (c.startsWith("ja")) {
      return "ja";
    }
    if (c.startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

let _messages: Messages | null = null;
let _locale: Locale = "en";

export async function initI18n(locale?: Locale): Promise<void> {
  _locale = locale ?? detectLocale();
  if (_locale === "ja") {
    const mod = await import("./ja.js");
    _messages = mod.messages as unknown as Messages;
  } else {
    const mod = await import("./en.js");
    _messages = mod.messages;
  }
}

export function t(key: keyof Messages): string {
  if (!_messages) {
    throw new Error("i18n not initialized. Call initI18n() first.");
  }
  return _messages[key] ?? key;
}

export function currentLocale(): Locale {
  return _locale;
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, afterEach } = import.meta.vitest;

  describe("detectLocale", () => {
    const orig = { ...process.env };
    afterEach(() => {
      for (const key of [
        "CLAUDE_CONFIG_LANG",
        "LANG",
        "LC_ALL",
        "LC_MESSAGES",
      ]) {
        if (key in orig) {
          process.env[key] = orig[key];
        } else {
          delete process.env[key];
        }
      }
    });

    it("defaults to en when no locale env vars are set", () => {
      // Given: all locale env vars are unset
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.CLAUDE_CONFIG_LANG;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LANG;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LC_ALL;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LC_MESSAGES;
      // When / Then
      expect(detectLocale()).toBe("en");
    });

    it("returns ja when CLAUDE_CONFIG_LANG=ja", () => {
      // Given
      process.env.CLAUDE_CONFIG_LANG = "ja";
      // When / Then
      expect(detectLocale()).toBe("ja");
    });

    it("returns ja when LANG=ja_JP.UTF-8 and CLAUDE_CONFIG_LANG unset", () => {
      // Given
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.CLAUDE_CONFIG_LANG;
      process.env.LANG = "ja_JP.UTF-8";
      // When / Then
      expect(detectLocale()).toBe("ja");
    });

    it("returns en when LANG=en_US.UTF-8 and CLAUDE_CONFIG_LANG unset", () => {
      // Given
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.CLAUDE_CONFIG_LANG;
      process.env.LANG = "en_US.UTF-8";
      // When / Then
      expect(detectLocale()).toBe("en");
    });

    it("CLAUDE_CONFIG_LANG takes priority over LANG", () => {
      // Given: conflicting signals
      process.env.CLAUDE_CONFIG_LANG = "ja";
      process.env.LANG = "en_US.UTF-8";
      // When / Then: higher-priority var wins
      expect(detectLocale()).toBe("ja");
    });

    it("falls back to LC_ALL when CLAUDE_CONFIG_LANG and LANG unset", () => {
      // Given
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.CLAUDE_CONFIG_LANG;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LANG;
      process.env.LC_ALL = "ja_JP.UTF-8";
      // When / Then
      expect(detectLocale()).toBe("ja");
    });

    it("falls back to LC_MESSAGES when higher-priority vars unset", () => {
      // Given
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.CLAUDE_CONFIG_LANG;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LANG;
      // biome-ignore lint/performance/noDelete: process.env needs delete to actually unset a key
      delete process.env.LC_ALL;
      process.env.LC_MESSAGES = "ja_JP.UTF-8";
      // When / Then
      expect(detectLocale()).toBe("ja");
    });
  });

  describe("initI18n + t()", () => {
    it("en: t() returns English strings after initI18n('en')", async () => {
      // Given
      await initI18n("en");
      // When / Then
      expect(t("header_title")).toBe("Claude Config Migration");
      expect(t("action_copy")).toBe("Copy");
    });

    it("ja: t() returns Japanese strings after initI18n('ja')", async () => {
      // Given
      await initI18n("ja");
      // When / Then
      expect(t("header_title")).toBe("Claude Config マイグレーション");
      expect(t("action_copy")).toBe("コピー");
    });

    it("ja messages cover all en keys (no missing translations)", async () => {
      // Given: both locale message maps loaded
      const en = await import("./en.js");
      const ja = await import("./ja.js");
      // When / Then: ja must have the exact same keys as en
      expect(Object.keys(ja.messages).sort()).toEqual(
        Object.keys(en.messages).sort()
      );
    });
  });
}
