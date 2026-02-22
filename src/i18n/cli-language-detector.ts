import { execSync } from "node:child_process";
import type { InitOptions, LanguageDetectorModule, Services } from "i18next";

type AppleLocaleReader = () => string | undefined;
type PlatformGetter = () => string;

const defaultAppleLocaleReader: AppleLocaleReader = () => {
  try {
    return execSync("defaults read -g AppleLocale", {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
};

export class CliLanguageDetector implements LanguageDetectorModule {
  static readonly type = "languageDetector" as const;
  readonly type = CliLanguageDetector.type;

  #services!: Services;
  #i18nextOptions!: InitOptions;
  readonly #readAppleLocale: AppleLocaleReader;
  readonly #getPlatform: PlatformGetter;

  constructor(
    readAppleLocale: AppleLocaleReader = defaultAppleLocaleReader,
    getPlatform: PlatformGetter = () => process.platform
  ) {
    this.#readAppleLocale = readAppleLocale;
    this.#getPlatform = getPlatform;
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
    // LC_ALL is the strongest override — honour it directly.
    const lcAll = process.env.LC_ALL;
    if (lcAll) {
      const resolved = this.#resolveLocale(lcAll);
      if (resolved != null) {
        return resolved;
      }
    }

    // macOS: prefer the system locale (AppleLocale) over shell defaults.
    // Many terminal emulators inject LANG=en_US.UTF-8 even when the system
    // language is set to a different locale (e.g. Japanese), so we read
    // the real setting from the macOS defaults database.
    if (this.#getPlatform() === "darwin") {
      const appleLocale = this.#readAppleLocale();
      if (appleLocale) {
        const resolved = this.#resolveLocale(appleLocale);
        if (resolved != null) {
          return resolved;
        }
      }
    }

    // Remaining shell locale vars (LC_MESSAGES > LANG > LANGUAGE).
    // LANGUAGE supports colon-separated priority lists (POSIX).
    const shellLocale =
      process.env.LC_MESSAGES ?? process.env.LANG ?? process.env.LANGUAGE;
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
      Record<"LC_ALL" | "LC_MESSAGES" | "LANG" | "LANGUAGE", string | undefined>
    >,
    opts: { platform?: string; appleLocale?: string } = {}
  ): Promise<string> => {
    vi.stubEnv("LC_ALL", env.LC_ALL);
    vi.stubEnv("LC_MESSAGES", env.LC_MESSAGES);
    vi.stubEnv("LANG", env.LANG);
    vi.stubEnv("LANGUAGE", env.LANGUAGE);
    const inst = i18next.createInstance();
    await inst
      .use(
        new CliLanguageDetector(
          () => opts.appleLocale,
          () => opts.platform ?? "linux"
        )
      )
      .init({
        fallbackLng: "en",
        supportedLngs: ["en", "ja"],
        resources,
        showSupportNotice: false,
      });
    return inst.language;
  };

  describe(CliLanguageDetector, () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("defaults to en when no locale env vars are set", async () => {
      // when / then
      expect(await detect({})).toBe("en");
    });

    it("returns ja when LANG=ja_JP.UTF-8", async () => {
      // when / then
      expect(await detect({ LANG: "ja_JP.UTF-8" })).toBe("ja");
    });

    it("returns en when LANG=en_US.UTF-8", async () => {
      // when / then
      expect(await detect({ LANG: "en_US.UTF-8" })).toBe("en");
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

    it("macOS: AppleLocale=ja_JP overrides LANG=en_US.UTF-8", async () => {
      // given: terminal injected en_US but system locale is Japanese
      // when / then
      expect(
        await detect(
          { LANG: "en_US.UTF-8" },
          { platform: "darwin", appleLocale: "ja_JP" }
        )
      ).toBe("ja");
    });

    it("macOS: LC_ALL takes priority over AppleLocale", async () => {
      // given: explicit LC_ALL=en should win even on macOS with ja_JP system locale
      // when / then
      expect(
        await detect(
          { LC_ALL: "en_US.UTF-8" },
          { platform: "darwin", appleLocale: "ja_JP" }
        )
      ).toBe("en");
    });

    it("macOS: unsupported AppleLocale falls back to shell vars", async () => {
      // given: AppleLocale is French (unsupported), LANG=ja_JP
      // when / then
      expect(
        await detect(
          { LANG: "ja_JP.UTF-8" },
          { platform: "darwin", appleLocale: "fr_FR" }
        )
      ).toBe("ja");
    });

    it("non-macOS: does not use AppleLocale", async () => {
      // given: linux with no shell vars but appleLocale injected (should be ignored)
      // when / then
      expect(
        await detect({}, { platform: "linux", appleLocale: "ja_JP" })
      ).toBe("en");
    });
  });
}
