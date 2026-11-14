export type Language = "en" | "zh-TW";

/** Explicit language wins; the tour follows the same language as its interface. */
export function resolveLanguage(
  requested: string | null | undefined,
  browserLanguage = "en",
  _demo = false,
): Language {
  if (requested === "en") return "en";
  if (["zh", "zh-TW", "zh-Hant"].includes(requested ?? "")) return "zh-TW";
  return /^zh(?:-|$)/i.test(browserLanguage) ? "zh-TW" : "en";
}

export function bilingual(lang: Language, en: string, zh: string): string {
  return lang === "en" ? en : zh;
}
