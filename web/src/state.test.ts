import { describe, expect, it } from "vitest";
import manifest from "../public/data/index.json";
import { parseIndex } from "./domain";
import { bilingual, resolveLanguage } from "./i18n";
import { explorerSearch, parseExplorerState } from "./state";

const index = parseIndex(manifest);

describe("bilingual shared state", () => {
  it("honors an explicit language and otherwise uses the browser locale", () => {
    expect(resolveLanguage("en", "zh-TW")).toBe("en");
    expect(resolveLanguage("zh-Hant", "en-US")).toBe("zh-TW");
    expect(resolveLanguage(null, "zh-HK")).toBe("zh-TW");
    expect(resolveLanguage("invalid", "fr-FR")).toBe("en");
    expect(bilingual("en", "Water", "水")).toBe("Water");
    expect(bilingual("zh-TW", "Water", "水")).toBe("水");
  });
  it("keeps the selected reservoir, date, polarization and comparison in a share URL", () => {
    const state = parseExplorerState(
      "?reservoir=liyutan&date=2026-06-21&pol=HV&lang=en&compareDate=2026-03-17",
      index,
      "zh-TW",
    );
    expect(state).toMatchObject({
      reservoirKey: "liyutan",
      polarization: "HV",
      lang: "en",
      demo: false,
    });
    expect(index.dates[state.dateIndex].utc_date).toBe("2026-06-21");
    expect(index.dates[state.compareDateIndex].utc_date).toBe("2026-03-17");
    expect(parseExplorerState(explorerSearch(state, index), index)).toEqual(
      state,
    );
  });
  it("falls back safely for malformed and unavailable query values", () => {
    const state = parseExplorerState(
      "?reservoir=unknown&date=2026-02-30&pol=QQ&compareDate=no&lang=no",
      index,
      "zh-TW",
    );
    expect(state).toMatchObject({
      reservoirKey: "baoshan2",
      polarization: "HH",
      lang: "zh-TW",
    });
    expect(index.dates[state.dateIndex].utc_date).toBe("2026-03-17");
    expect(index.dates[state.compareDateIndex].utc_date).toBe("2025-11-05");
    const gap = parseExplorerState("?date=2026-05-30", index);
    expect(index.dates[gap.dateIndex].utc_date).toBe("2026-06-21");
  });
  it("forces English for demo links and preserves unrelated URL parameters", () => {
    const state = parseExplorerState("?demo=1&lang=zh-TW", index, "zh-TW");
    expect(state.demo).toBe(true);
    expect(state.lang).toBe("en");
    const query = new URLSearchParams(
      explorerSearch(state, index, "?source=classroom"),
    );
    expect(query.get("source")).toBe("classroom");
    expect(query.get("demo")).toBe("1");
    expect(query.get("lang")).toBe("en");
    const stopped = new URLSearchParams(
      explorerSearch({ ...state, demo: false }, index, query.toString()),
    );
    expect(stopped.has("demo")).toBe(false);
  });
  it("rejects corrupt internal state instead of sharing a broken selection", () => {
    const state = parseExplorerState("", index);
    expect(() => explorerSearch({ ...state, dateIndex: 99 }, index)).toThrow();
    expect(() => parseExplorerState("", { ...index, dates: [] })).toThrow();
  });
});
