import i18next from "i18next";
import { CliLanguageDetector } from "./cli-language-detector.js";
import { messages as en } from "./en.js";
import { messages as ja } from "./ja.js";

export type Locale = "en" | "ja";
export type Messages = typeof en;

i18next.use(CliLanguageDetector);

export const initI18n = async (locale?: Locale): Promise<void> => {
  if (i18next.isInitialized) {
    await i18next.changeLanguage(locale ?? i18next.language);
  } else {
    await i18next.init({
      ...(locale ? { lng: locale } : {}),
      fallbackLng: "en",
      supportedLngs: ["en", "ja"],
      resources: {
        en: { translation: en },
        ja: { translation: ja },
      },
      interpolation: { escapeValue: false },
      showSupportNotice: false,
    });
  }
};

export const t = (key: keyof Messages): string => {
  if (!i18next.isInitialized) {
    throw new Error("i18n not initialized. Call initI18n() first.");
  }
  return i18next.t(key) as string;
};

export const currentLocale = (): Locale => i18next.language as Locale;

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, vi } = import.meta.vitest;

  describe("initI18n + t()", () => {
    it("throws when t() is called before initI18n()", () => {
      // when / then
      expect(() => t("header_title")).toThrow("i18n not initialized");
    });

    it("picks up locale from env when called without an argument", async () => {
      // given
      vi.stubEnv("LANG", "ja_JP.UTF-8");
      vi.stubEnv("CLAUDE_CONFIG_LANG", undefined);
      vi.stubEnv("LC_ALL", undefined);
      vi.stubEnv("LC_MESSAGES", undefined);
      // when
      await initI18n();
      // then
      expect(currentLocale()).toBe("ja");
      // Restore to en for subsequent tests
      await initI18n("en");
      vi.unstubAllEnvs();
    });

    it("en: t() returns English strings after initI18n('en')", async () => {
      // given
      await initI18n("en");
      // when / then
      expect(t("header_title")).toBe("Claude Config Migration");
      expect(t("action_copy")).toBe("Copy");
    });

    it("ja: t() returns Japanese strings after initI18n('ja')", async () => {
      // given
      await initI18n("ja");
      // when / then
      expect(t("header_title")).toBe("Claude Config マイグレーション");
      expect(t("action_copy")).toBe("コピー");
    });

    it("ja messages cover all en keys (no missing translations)", async () => {
      // given
      const enMod = await import("./en.js");
      const jaMod = await import("./ja.js");
      // when / then
      expect(Object.keys(jaMod.messages).sort()).toEqual(
        Object.keys(enMod.messages).sort()
      );
    });

    it("currentLocale() reflects the locale set by initI18n", async () => {
      // given
      await initI18n("ja");
      // when / then
      expect(currentLocale()).toBe("ja");
    });

    it("t() returns the key itself when it has no translation (defensive fallback)", async () => {
      // given
      await initI18n("en");
      // when: cast bypasses TS type check to simulate a missing key at runtime
      const result = t("__missing_key__" as keyof Messages);
      // then
      expect(result).toBe("__missing_key__");
    });
  });
}
