import osLocale from "os-locale";
import type { InitOptions, LanguageDetectorModule, Services } from "i18next";

type OsLocaleReader = () => string | undefined;

const defaultOsLocaleReader: OsLocaleReader = () => {
  try {
    return osLocale();
  } catch {
    return undefined;
  }
};

export class CliLanguageDetector implements LanguageDetectorModule {
  static readonly type = "languageDetector" as const;
  readonly type = CliLanguageDetector.type;

  #services!: Services;
  #i18nextOptions!: InitOptions;
  readonly #readOsLocale: OsLocaleReader;

  constructor(readOsLocale: OsLocaleReader = defaultOsLocaleReader) {
    this.#readOsLocale = readOsLocale;
  }

  init(
    services: Services,
    _detectorOptions: object,
    i18nextOptions: InitOptions
  ): void {
    this.#services = services;
    this.#i18nextOptions = i18nextOptions;
  }

  detect(): string | readonly string[] | undefined {
    // os-locale が LC_ALL・LC_MESSAGES・LANG・LANGUAGE 環境変数および
    // macOS の AppleLocale (defaults read -g AppleLocale) を統合的に解決する。
    const locale = this.#readOsLocale();
    if (locale) {
      const resolved = this.#resolveLocale(locale);
      if (resolved != null) {
        return resolved;
      }
    }

    // Fall back to i18next fallbackLng
    const { fallbackLng } = this.#i18nextOptions;
    if (Array.isArray(fallbackLng)) {
      return [...fallbackLng];
    }
    if (typeof fallbackLng === "string") {
      return fallbackLng;
    }
    return undefined;
  }

  cacheUserLanguage(): void {
    // no-op: locale is determined at startup from the system
  }

  // ロケール文字列を、サポート対象の言語コードに正規化する。
  // POSIX 形式 ("ja_JP.UTF-8") と BCP 47 形式 ("ja-JP") の両方に対応する。
  #resolveLocale(raw: string): string | undefined {
    // エンコーディングサフィックス (.UTF-8 など) を除去し、言語サブタグを抽出する。
    const langCode = raw.split(".")[0].split(/[_-]/)[0];
    if (!langCode) return undefined;

    if (!this.#services.languageUtils.isSupportedCode(langCode)) {
      return undefined;
    }
    return this.#services.languageUtils.formatLanguageCode(langCode);
  }
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { default: i18next } = await import("i18next");

  const resources = {
    en: { translation: {} },
    ja: { translation: {} },
  };

  const detect = async (
    osLocaleResult: string | undefined
  ): Promise<string> => {
    const inst = i18next.createInstance();
    await inst
      .use(new CliLanguageDetector(() => osLocaleResult))
      .init({
        fallbackLng: "en",
        supportedLngs: ["en", "ja"],
        resources,
        showSupportNotice: false,
      });
    return inst.language;
  };

  describe(CliLanguageDetector, () => {
    it("defaults to en when os-locale returns undefined", async () => {
      // when / then
      expect(await detect(undefined)).toBe("en");
    });

    it("returns ja for BCP 47 locale 'ja-JP'", async () => {
      // when / then
      expect(await detect("ja-JP")).toBe("ja");
    });

    it("returns en for BCP 47 locale 'en-US'", async () => {
      // when / then
      expect(await detect("en-US")).toBe("en");
    });

    it("falls back to en when locale is an unsupported language", async () => {
      // when / then
      expect(await detect("fr-FR")).toBe("en");
    });

    it("handles POSIX format locale 'ja_JP.UTF-8'", async () => {
      // when / then
      expect(await detect("ja_JP.UTF-8")).toBe("ja");
    });

    it("handles POSIX format locale 'en_US.UTF-8'", async () => {
      // when / then
      expect(await detect("en_US.UTF-8")).toBe("en");
    });

    it("falls back to en when os-locale returns an empty string", async () => {
      // when / then
      expect(await detect("")).toBe("en");
    });
  });
}
