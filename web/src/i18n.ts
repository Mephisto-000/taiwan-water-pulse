export type Language = "en" | "zh-TW";

/** The demo has English subtitles regardless of the visitor's browser locale. */
export function resolveLanguage(
  requested: string | null | undefined,
  browserLanguage = "en",
  demo = false,
): Language {
  if (demo) return "en";
  if (requested === "en") return "en";
  if (["zh", "zh-TW", "zh-Hant"].includes(requested ?? "")) return "zh-TW";
  return /^zh(?:-|$)/i.test(browserLanguage) ? "zh-TW" : "en";
}

export function bilingual(lang: Language, en: string, zh: string): string {
  return lang === "en" ? en : zh;
}
