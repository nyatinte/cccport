import type { InitOptions, LanguageDetectorModule, Services } from "i18next";

export class CliLanguageDetector implements LanguageDetectorModule {
  static readonly type = "languageDetector" as const;
  readonly type = CliLanguageDetector.type;

  #services!: Services;
  #i18nextOptions!: InitOptions;

  init(
    services: Services,
    _detectorOptions: object,
    i18nextOptions: InitOptions
  ): void {
    this.#services = services;
    this.#i18nextOptions = i18nextOptions;
  }

  detect(): string | readonly string[] | undefined {
    // CLAUDE_CONFIG_LANG takes highest priority
    const customLang = process.env.CLAUDE_CONFIG_LANG;
    if (customLang) {
      const resolved = this.#resolveLocale(customLang);
      if (resolved != null) {
        return resolved;
      }
    }

    // Standard shell locale vars (LC_ALL > LC_MESSAGES > LANG > LANGUAGE)
    const shellLocale =
      process.env.LC_ALL ??
      process.env.LC_MESSAGES ??
      process.env.LANG ??
      process.env.LANGUAGE;
    if (shellLocale) {
      const resolved = this.#resolveLocale(shellLocale);
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
    // no-op: locale is determined at startup from env vars
  }

  // Normalise a raw locale string (or colon-separated list) to a supported
  // language code using i18next's own languageUtils.
  // e.g. "ja_JP.UTF-8" → "ja", "en_US:fr_FR" → ["en"] (if only en supported)
  #resolveLocale(raw: string): string | readonly string[] | undefined {
    const codes = raw
      .split(":")
      .map((s) => s.split(".")[0].split("_")[0])
      .filter(
        (code) => code && this.#services.languageUtils.isSupportedCode(code)
      )
      .map((code) => this.#services.languageUtils.formatLanguageCode(code));

    if (codes.length === 0) {
      return undefined;
    }
    if (codes.length === 1) {
      return codes[0];
    }
    return codes;
  }
}

// ─── in-source tests ──────────────────────────────────────────────────────────
if (import.meta.vitest) {
  const { describe, it, expect, afterEach, vi } = import.meta.vitest;
  const { default: i18next } = await import("i18next");

  const resources = {
    en: { translation: {} },
    ja: { translation: {} },
  };

  const detect = async (
    env: Partial<
      Record<
        "CLAUDE_CONFIG_LANG" | "LC_ALL" | "LC_MESSAGES" | "LANG" | "LANGUAGE",
        string | undefined
      >
    >
  ): Promise<string> => {
    vi.stubEnv("CLAUDE_CONFIG_LANG", env.CLAUDE_CONFIG_LANG);
    vi.stubEnv("LC_ALL", env.LC_ALL);
    vi.stubEnv("LC_MESSAGES", env.LC_MESSAGES);
    vi.stubEnv("LANG", env.LANG);
    vi.stubEnv("LANGUAGE", env.LANGUAGE);
    const inst = i18next.createInstance();
    await inst.use(CliLanguageDetector).init({
      fallbackLng: "en",
      supportedLngs: ["en", "ja"],
      resources,
      showSupportNotice: false,
    });
    return inst.language;
  };

  describe("CliLanguageDetector", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("defaults to en when no locale env vars are set", async () => {
      // when / then
      expect(await detect({})).toBe("en");
    });

    it("returns ja when CLAUDE_CONFIG_LANG=ja", async () => {
      // when / then
      expect(await detect({ CLAUDE_CONFIG_LANG: "ja" })).toBe("ja");
    });

    it("returns ja when LANG=ja_JP.UTF-8 and CLAUDE_CONFIG_LANG unset", async () => {
      // when / then
      expect(await detect({ LANG: "ja_JP.UTF-8" })).toBe("ja");
    });

    it("returns en when LANG=en_US.UTF-8 and CLAUDE_CONFIG_LANG unset", async () => {
      // when / then
      expect(await detect({ LANG: "en_US.UTF-8" })).toBe("en");
    });

    it("CLAUDE_CONFIG_LANG takes priority over LANG", async () => {
      // when / then
      expect(
        await detect({ CLAUDE_CONFIG_LANG: "ja", LANG: "en_US.UTF-8" })
      ).toBe("ja");
    });

    it("defaults to en when locale is an unknown language code", async () => {
      // when / then
      expect(await detect({ LANG: "fr_FR.UTF-8" })).toBe("en");
    });

    it("LC_ALL takes priority over LANG", async () => {
      // when / then
      expect(await detect({ LC_ALL: "ja_JP.UTF-8", LANG: "en_US.UTF-8" })).toBe(
        "ja"
      );
    });

    it("falls back to LC_MESSAGES when LC_ALL unset", async () => {
      // when / then
      expect(await detect({ LC_MESSAGES: "ja_JP.UTF-8" })).toBe("ja");
    });
  });
}
