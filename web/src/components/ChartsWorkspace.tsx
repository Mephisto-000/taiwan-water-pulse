import { useEffect, useRef, useState } from "react";
import type { Acquisition, OfficialSeries } from "../domain";
import type { Language } from "../i18n";
import { canPublishArea, type NumericalArchive } from "../numerical";
import { fitStoragePrediction } from "../prediction";
import { gradeDescription } from "../workspace";
import AnalysisCharts, { ScatterPlot } from "./AnalysisCharts";
import PredictionSettings from "./PredictionSettings";
import WeatherContext from "./WeatherContext";
import { useWeather } from "./useWeather";
import EventDialog from "./EventDialog";
import { useEvents } from "./useEvents";
import { matchingEstimation } from "../storageEstimation";
import type {
  EstimationMethod,
  StorageEstimationReport,
} from "../storageEstimationTypes";
import StorageExplanation from "./StorageExplanation";
import StorageEstimateDetail from "./StorageEstimateDetail";

export default function ChartsWorkspace({
  archive,
  official,
  gaugeError,
  onRetry,
  reservoirKey,
  dates,
  selected,
  onSelect,
  gap,
  lang,
  onReturnToImage,
  estimationReport = null,
  estimationError = false,
  onRetryEstimation = () => {},
  onMethods = () => {},
}: {
  archive: NumericalArchive | null;
  official: OfficialSeries | null;
  gaugeError: boolean;
  onRetry: () => void;
  reservoirKey: string;
  dates: Acquisition[];
  selected: Acquisition;
  onSelect: (index: number) => void;
  gap: { start: string; end: string };
  lang: Language;
  onReturnToImage: () => void;
  estimationReport?: StorageEstimationReport | null;
  estimationError?: boolean;
  onRetryEstimation?: () => void;
  onMethods?: () => void;
}) {
  const [showPrediction, setShowPrediction] = useState(false);
  const [showWeather, setShowWeather] = useState(false);
  const [showLevel, setShowLevel] = useState(false);
  const [scatterOpen, setScatterOpen] = useState(false);
  const scatterDialog = useRef<HTMLDialogElement>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const eventData = useEvents(showEvents);
  const events =
    eventData.events?.filter((event) =>
      event.reservoirs.includes(reservoirKey),
    ) ?? [];
  const selectedEvent = showEvents
    ? (events.find((event) => event.id === selectedEventId) ?? null)
    : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sampleCount, setSampleCount] = useState(6);
  const [method, setMethod] = useState<EstimationMethod>("two-stage");
  const weather = useWeather(reservoirKey, showWeather);
  const [weatherDate, setWeatherDate] = useState(selected.local.slice(0, 10));
  const [weatherDetailsOpen, setWeatherDetailsOpen] = useState(false);
  useEffect(() => {
    setWeatherDate(selected.local.slice(0, 10));
  }, [selected.local]);
  useEffect(() => {
    setSelectedEventId(null);
  }, [reservoirKey]);
  const inspectWeatherDate = (date: string) => {
    setWeatherDate(date);
    setWeatherDetailsOpen(true);
  };
  const en = lang === "en";
  const publishArea = Boolean(archive && canPublishArea(archive));
  useEffect(() => {
    const dialog = scatterDialog.current;
    if (scatterOpen && publishArea && dialog && !dialog.open)
      dialog.showModal();
    else if ((!scatterOpen || !publishArea) && dialog?.open) dialog.close();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [scatterOpen, publishArea]);
  const pairCount =
    archive?.series.records.filter((r) => r.official.pct != null).length ?? 0;
  const calibrationCount = Math.min(sampleCount, Math.max(3, pairCount - 3));
  const estimation = matchingEstimation(
    estimationReport,
    reservoirKey,
    archive,
  );
  const canPredict = Boolean(
    publishArea &&
    archive?.meta.validation.grade === "A" &&
    estimation?.eligible &&
    pairCount >= 6,
  );
  const selectedEstimate = canPredict
    ? estimation?.points.find((p) => p.utc === selected.utc)
    : null;
  const model =
    canPredict && archive
      ? fitStoragePrediction(archive.series.records, calibrationCount)
      : null;
  return (
    <section className="charts-workspace compact-charts">
      <aside
        className="chart-controls"
        aria-label={en ? "Chart options" : "圖表選項"}
      >
        <h1>{en ? "Radar area & official storage" : "雷達面積與官方蓄水率"}</h1>
        <fieldset>
          <legend className="sr-only">
            {en ? "Visible chart layers" : "顯示的圖表內容"}
          </legend>
          <label>
            <input
              type="checkbox"
              checked={showPrediction}
              disabled={!canPredict}
              onChange={(event) => setShowPrediction(event.target.checked)}
            />
            {en ? "Estimate storage from SAR" : "由 SAR 估計蓄水率"}
          </label>
          <button
            type="button"
            className="text-button chart-method-button"
            onClick={() => setSettingsOpen(true)}
            aria-haspopup="dialog"
          >
            {en ? "Adjust prediction method ↗" : "調整估計方法 ↗"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={showWeather}
              onChange={(event) => setShowWeather(event.target.checked)}
            />
            {en ? "Real weather" : "顯示真實天氣資訊"}
          </label>
          <label>
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(change) => {
                setShowEvents(change.target.checked);
                if (!change.target.checked) setSelectedEventId(null);
              }}
            />
            {en ? "Weather & water events" : "氣象與水情事件"}
          </label>
          <label>
            <input
              type="checkbox"
              checked={showLevel}
              onChange={(event) => setShowLevel(event.target.checked)}
            />
            {en ? "Official water level" : "官方水位"}
          </label>
          <button
            type="button"
            className="text-button chart-method-button"
            disabled={!publishArea}
            aria-haspopup="dialog"
            aria-controls="area-level-dialog"
            onClick={() => setScatterOpen(true)}
          >
            {en ? "Area vs. water level ↗" : "面積與水位關係圖 ↗"}
          </button>
        </fieldset>
        {showEvents && (
          <p
            className="compact-model-status"
            role={eventData.error ? "alert" : "status"}
          >
            {eventData.error ? (
              <>
                {en ? "Event records could not load. " : "事件紀錄載入失敗。"}
                <button type="button" onClick={eventData.retry}>
                  {en ? "Retry" : "重試"}
                </button>
              </>
            ) : eventData.events === null ? (
              en ? (
                "Loading event records…"
              ) : (
                "正在載入事件紀錄…"
              )
            ) : events.length ? (
              en ? (
                `${events.length} recorded events · select a timeline marker for details.`
              ) : (
                `已收錄 ${events.length} 筆事件 · 點選日期軸標記查看詳情。`
              )
            ) : en ? (
              "No events recorded for this reservoir yet."
            ) : (
              "此水庫尚無已收錄事件。"
            )}
          </p>
        )}
        {archive?.meta.validation.grade === "A" && !estimation && (
          <p
            className="compact-model-status"
            role={estimationError || estimationReport ? "alert" : "status"}
          >
            {estimationError || estimationReport
              ? en
                ? "Storage evaluation is unavailable or does not match this archive. Estimates are disabled."
                : "估計評估無法載入或與目前觀測資料不一致，已停用估計。"
              : en
                ? "Loading storage evaluation…"
                : "正在載入估計評估…"}
            {(estimationError || estimationReport) && (
              <button type="button" onClick={onRetryEstimation}>
                {en ? "Retry" : "重試"}
              </button>
            )}
          </p>
        )}
        {showPrediction &&
          canPredict &&
          method === "two-stage" &&
          estimation?.evaluation && (
            <div className="compact-model-status" role="status">
              <p>
                {en
                  ? `High-water ${estimation.evaluation.high.correct_count}/${estimation.evaluation.high.n} match the descriptive bound; ${estimation.evaluation.numeric.n} low-water dates: mean error ${estimation.evaluation.numeric.mae_pp.toFixed(1)} pp; ${estimation.evaluation.high.false_high_count + estimation.evaluation.high.false_low_count} misclassification(s).`
                  : `高水位 ${estimation.evaluation.high.correct_count}/${estimation.evaluation.high.n} 次符合描述性下限；低水位 ${estimation.evaluation.numeric.n} 次平均差 ${estimation.evaluation.numeric.mae_pp.toFixed(1)} 個百分點；${estimation.evaluation.high.false_high_count + estimation.evaluation.high.false_low_count} 次誤判。`}
              </p>
              <p>
                {en
                  ? `Largest low-water error ${estimation.evaluation.numeric.max_abs_error_pp.toFixed(1)} pp. Exploratory, not independent validation.`
                  : `低水位最大誤差 ${estimation.evaluation.numeric.max_abs_error_pp.toFixed(1)} 個百分點；探索性檢驗，非獨立驗證。`}
              </p>
            </div>
          )}
        {showPrediction && canPredict && method === "linear" && (
          <p className="compact-model-status" role="status">
            {model
              ? `${en ? "Calibration" : "校正"} n=${calibrationCount} · MAE ${model.evaluation.mae?.toFixed(1)} ${en ? "pp" : "百分點"}`
              : en
                ? "Insufficient variation to fit"
                : "變化不足，無法校正"}
            {model && (
              <>
                <br />
                {en ? "Extrapolated" : "外插"}:{" "}
                {
                  model.points.filter((p) => !p.training && p.extrapolated)
                    .length
                }{" "}
                · {en ? "Outside 0–100%" : "超出 0–100%"}:{" "}
                {
                  model.points.filter(
                    (p) => p.predicted < 0 || p.predicted > 100,
                  ).length
                }
                {(model.storageSpan < 10 || model.slope <= 0) && (
                  <>
                    <br />
                    {en
                      ? "Weak calibration; see method"
                      : "校正範圍不足或斜率異常，請看方法"}
                  </>
                )}
              </>
            )}
          </p>
        )}
        {archive && !publishArea && (
          <p className="compact-model-status">
            {en
              ? "Quantitative SAR area and prediction unavailable for this reservoir."
              : "此水庫不提供定量 SAR 面積與預估。"}
          </p>
        )}
        {archive?.meta.validation.grade === "B" && (
          <p className="compact-model-status">
            {en
              ? "Grade B: storage estimation is disabled; see the method for the reason."
              : "B 級不做蓄水率估計；原因請看估計方法。"}
          </p>
        )}
        <StorageExplanation
          report={estimation ? estimationReport : null}
          lang={lang}
          onMethods={onMethods}
          onEstimate={() => setShowPrediction(true)}
          canEstimate={canPredict}
        />
        <div className="chart-key">
          <span>
            {en
              ? "● SAR area · bars: threshold sensitivity"
              : "● SAR 面積 · 線段：門檻敏感度"}
          </span>
          <span>
            {en ? "○ / line: official storage" : "○／折線：官方蓄水率"}
          </span>
          {showWeather && (
            <span>
              {en
                ? "☂ rain · ○ no measured rain · ? missing; nearby station, not catchment mean"
                : "☂ 有雨 · ○ 未測得雨 · ? 缺值；鄰近測站，非集水區平均"}
            </span>
          )}
          {showPrediction && canPredict && method === "linear" && (
            <span>
              {en
                ? "Orange dashed: estimate · ▲/▼ outside 0–100%"
                : "橘色虛線：當日估計 · ▲/▼ 超出 0–100%"}
            </span>
          )}
        </div>
        <details className="chart-reading-notes">
          <summary>{en ? "How to read" : "圖表怎麼看"}</summary>
          <p>
            {en
              ? "Taiwan dates. Grey shading marks the SAR gap. Area bars are threshold sensitivity, not confidence intervals. † marks a quality flag. Missing observations remain empty."
              : "橫軸是台灣日期。灰色陰影是 SAR 缺口。面積線段是門檻敏感度，不是信賴區間；† 為品質旗標，缺值保留空白。"}
          </p>
          {showPrediction && canPredict && (
            <p>
              {method === "two-stage"
                ? en
                  ? "Pale orange date bands mean high water, with finer levels unresolved. They do not identify a calibration period."
                  : "淡橘色日期短帶表示水位偏高、分不出更細，並非校正期間。"
                : en
                  ? "In the linear comparison, orange shading marks the first-N calibration period."
                  : "直線對照的橘色陰影表示前 N 筆校正期間。"}
            </p>
          )}
          {archive && (
            <p>{gradeDescription(archive.meta.validation.grade, lang)}</p>
          )}
        </details>
        <button type="button" className="text-button" onClick={onReturnToImage}>
          {en ? "← Back to radar image" : "← 回到雷達影像"}
        </button>
      </aside>
      <div className="chart-stack">
        {gaugeError ? (
          <div role="alert">
            <p>
              {en ? "Official records could not load." : "官方紀錄載入失敗。"}
            </p>
            <button onClick={onRetry}>{en ? "Retry" : "重試"}</button>
          </div>
        ) : official ? (
          <AnalysisCharts
            archive={archive}
            records={official.records}
            dates={dates}
            selected={selected}
            onSelect={onSelect}
            gap={gap}
            lang={lang}
            showArea={publishArea}
            showLevel={showLevel}
            prediction={
              showPrediction && canPredict && method === "linear" ? model : null
            }
            twoStage={
              showPrediction && canPredict && method === "two-stage"
                ? estimation
                : null
            }
            weather={weather.series}
            weatherInspectionDate={weatherDetailsOpen ? weatherDate : undefined}
            onInspectWeatherDate={inspectWeatherDate}
            events={events}
            onInspectEvent={(event) => setSelectedEventId(event.id)}
          />
        ) : (
          <p role="status">
            {en ? "Loading official observations…" : "正在載入官方觀測…"}
          </p>
        )}
        {showPrediction &&
          canPredict &&
          method === "two-stage" &&
          selectedEstimate && (
            <StorageEstimateDetail point={selectedEstimate} lang={lang} />
          )}
        {showWeather && official && (
          <WeatherContext
            series={weather.series}
            error={weather.error}
            onRetry={weather.retry}
            selectedDate={weatherDate}
            onDateChange={setWeatherDate}
            open={weatherDetailsOpen}
            onOpenChange={setWeatherDetailsOpen}
            lang={lang}
          />
        )}
      </div>
      <EventDialog
        event={selectedEvent}
        onClose={() => setSelectedEventId(null)}
        lang={lang}
      />
      <dialog
        ref={scatterDialog}
        id="area-level-dialog"
        className="scatter-dialog"
        aria-labelledby="area-level-title"
        onCancel={() => setScatterOpen(false)}
        onClose={() => setScatterOpen(false)}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.target === event.currentTarget &&
            (event.clientX < rect.left ||
              event.clientX > rect.right ||
              event.clientY < rect.top ||
              event.clientY > rect.bottom)
          )
            setScatterOpen(false);
        }}
      >
        <div className="scatter-dialog-header">
          <h2 id="area-level-title">
            {en
              ? "Does SAR area grow as water level rises?"
              : "水位較高時，SAR 面積也較大嗎？"}
          </h2>
          <button
            type="button"
            aria-label={en ? "Close relationship chart" : "關閉關係圖"}
            onClick={() => setScatterOpen(false)}
            autoFocus
          >
            ×
          </button>
        </div>
        {scatterOpen && publishArea && archive && (
          <ScatterPlot
            archive={archive}
            dates={dates}
            selected={selected}
            onSelect={onSelect}
            gap={gap}
            lang={lang}
            showArea
          />
        )}
      </dialog>
      <PredictionSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        lang={lang}
        pairCount={pairCount}
        calibrationCount={calibrationCount}
        onSampleCountChange={setSampleCount}
        prediction={model}
        method={method}
        onMethodChange={setMethod}
        estimation={estimation}
        grade={archive?.meta.validation.grade ?? "unavailable"}
      />
    </section>
  );
}
