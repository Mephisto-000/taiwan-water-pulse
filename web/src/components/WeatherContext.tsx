import type { Language } from "../i18n";
import { rainIcon, rainLabel, type WeatherSeries } from "../weather";

export default function WeatherContext({
  series,
  error,
  onRetry,
  selectedDate,
  onDateChange,
  open,
  onOpenChange,
  lang,
}: {
  series: WeatherSeries | null;
  error: boolean;
  onRetry: () => void;
  selectedDate: string;
  onDateChange: (date: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lang: Language;
}) {
  const en = lang === "en";
  const day = series?.records.find((row) => row.local_date === selectedDate);
  return (
    <section
      className="weather-context"
      aria-label={en ? "Real Weather" : "真實天氣觀測"}
    >
      {error ? (
        <div role="alert">
          <p>
            {en
              ? "Weather observations could not load. Missing data are not zero rainfall."
              : "氣象資料載入失敗；缺值不代表零雨量。"}
          </p>
          <button onClick={onRetry}>
            {en ? "Retry weather" : "重新載入氣象資料"}
          </button>
        </div>
      ) : !series ? (
        <p role="status">
          {en ? "Loading historical observations…" : "載入歷史氣象觀測…"}
        </p>
      ) : (
        <details
          open={open}
          onToggle={(event) => onOpenChange(event.currentTarget.open)}
        >
          <summary>
            {en ? "Station details & daily lookup" : "測站資訊與每日查詢"}
          </summary>
          <label>
            {en ? "Inspect a local date" : "查看台灣日期"}{" "}
            <input
              type="date"
              value={selectedDate}
              min={series.period.start}
              max={series.period.end}
              onChange={(event) => {
                if (
                  event.target.value >= series.period.start &&
                  event.target.value <= series.period.end
                )
                  onDateChange(event.target.value);
              }}
            />
          </label>
          <p aria-live="polite">
            <strong>
              {selectedDate} · {rainIcon(day)} {rainLabel(day, en)} ·{" "}
              {day?.rainfall_mm != null
                ? `${day.rainfall_mm.toFixed(1)} mm`
                : "—"}
            </strong>
            {day?.sunshine_hours != null
              ? ` · ${en ? "Sunshine" : "日照"} ${day.sunshine_hours.toFixed(1)} h`
              : ""}
            {day?.rainfall_quality_flag
              ? ` · ${en ? "Source quality flag" : "來源品質旗標"}: ${day.rainfall_quality_flag}`
              : ""}
          </p>
          <p>
            {en ? series.station.name : series.station.name_zh} (
            {series.station.id}) ·{" "}
            {series.station.distance_to_reservoir_center_km.toFixed(1)} km{" "}
            {en ? "from reservoir map centre" : "距水庫圖幅中心"} ·{" "}
            <a href={series.source} target="_blank" rel="noreferrer">
              CWA CODiS ↗
            </a>
          </p>
          <p className="chart-note">
            {en
              ? "Icons mark SAR dates (some are omitted on narrow charts to avoid overlap): ☂ rain/trace · ○ no measurable rain, sky unknown · ☀ measured sunshine with no rain · ? missing. Bars cover every calendar day, including the SAR gap."
              : "圖示對應 SAR 日期（窄畫面會省略部分圖示以免重疊）：☂ 有雨／雨跡 · ○ 未測得雨、晴陰未知 · ☀ 有日照且無雨 · ? 缺值。長條涵蓋每日，包括 SAR 缺口。"}
          </p>
          <p>
            {series.period.start} – {series.period.end} ·{" "}
            {en ? "Missing days" : "缺值日數"}:{" "}
            {series.records.filter((r) => r.condition === "missing").length} ·{" "}
            {en ? "Retrieved" : "整理時間"}: {series.generated_at.slice(0, 10)}
          </p>
          <p>
            {en
              ? "Nearby station measurements, not catchment-average rain. Rain status is derived from daily accumulation; an official daily sky-condition summary is unavailable here. No rain does not mean sunshine. Daily totals include hours after the SAR overpass, so they are context, not inputs to the storage prediction. Original nonzero CWA quality flags remain visible and are not reinterpreted. Weather context alone does not establish why storage changed."
              : "這是鄰近測站的點觀測，不是集水區平均雨量。晴雨標記依每日累積雨量產生，此來源未提供每日主要天氣文字；無雨不等於晴天。日累積量包含 SAR 通過之後的時段，只作背景，不輸入蓄水率預估。保留並顯示氣象署非零品質旗標，不自行改判其含義。天氣背景本身不能證明蓄水變化的原因。"}
          </p>
        </details>
      )}
    </section>
  );
}
