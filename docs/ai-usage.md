# SI 使用紀錄｜Use of Super Intelligence

**SI-generated / SI-assisted — OpenAI Codex**。本專案依使用者提供的 SI 規範截圖，揭露程式碼、文案、圖示與資料整理流程的使用範圍；這份紀錄不是完整競賽規則查證或官方認證。可機讀聲明為根目錄的 [si-usage.json](../si-usage.json)，部署時另提供同源 `/data/si-usage.json`。

| 內容 | 實際使用與標記 |
| --- | --- |
| 程式碼 | Codex 產生與協助修改 React／TypeScript、Python、測試與部署設定；README、聲明 JSON、HTML meta 與主要輸出程式註解揭露 |
| 文字 | 介面文案、翻譯、README、方法說明與提交草稿使用 SI 協助；網站首頁及資料方法區提供可見說明 |
| 資料 | 透過 SI 協助產生的程式進行擷取、格式轉換、取樣、匯出與診斷；index、provenance 與官方資料 JSON 均附 SI metadata，重新匯出時保留 |
| 原始觀測與雷達預覽圖 | 非 SI 生成；每張 ASF 預覽圖在 provenance 標為 `si_generated: false`，保留原始位元組與 SHA-256，不加入會改變來源影像的浮水印 |
| 自訂 SVG 圖示 | SI 生成程式碼繪製的專案圖示，不採用機構品牌設計；網站顯示 `SI-generated icon`，SVG 附 metadata，favicon 使用可見 `SI` 字樣與 SI-generated 標題 |
| 截圖 | 既有 JPG 為瀏覽器實際擷取 SI 協助開發的介面，不是生成式衛星圖；拍攝時尚未加入新 SI 提示的截圖視為歷史畫面 |
| 音訊／影片 | repository 目前沒有這類媒體成品；demo-script.md 是 SI 協助撰寫的文字腳本 |

新增 SI 生成影像／影片時，必須在媒體本身放置清楚可見的 `SI-generated` 浮水印；新增 SI 音訊時，必須在描述文字與媒體 metadata 揭露。錄製 SI 旁白的影片需同時揭露旁白與其他 SI 生成素材。不能只填寫競賽表單而讓作品本身沒有標記。

不得以 SI 製作、修改或拼接 NASA 品牌圖案、標誌、旗幟或任務徽章。本站僅以文字標示實際資料來源與任務名稱，自訂專案圖示不含上述品牌元素；不宣稱官方背書。提交頁的 SI 選項與作品提交仍由 owner 依實際使用情況處理。

## Implementation history and review limits

Codex assisted with the initial implementation on 2026-11-14. Work was divided between implementation agents for the frontend, pipeline and documentation, with shared integration checks.

AI assistance includes:

- Repository setup, TypeScript/React interface code and static-site workflow configuration.
- Python source-access and export code, numerical utility functions and test cases.
- English interface copy, documentation and submission drafts based on the supplied brief.
- Automated code inspection, build/test execution and interpretation of their outputs.
- Authenticated numerical window processing, independent native-grid replay, frozen calibration and held-out validation diagnostics. Both held-out classifiers failed and quantitative results were withheld from the product.

No synthetic radar images, fabricated reservoir observations or invented official records are used. Candidate counts were calculated from real calibrated arrays by the documented offline code and are retained only as failed-method diagnostics. Synthetic arrays in unit tests are test fixtures only. Real data availability and unmet numerical gates are disclosed. Institutional logos are not used.

The human user supplied the product brief and authorized the initial GitHub push, selecting Traditional Chinese commit messages. That authorization does not constitute a scientific review. No independent human verification of the calibrated SAR method or competition submission has been claimed. The team should review the published data provenance, scientific limits, screenshot content and current competition rules before submitting.

Automated tests and successful builds provide evidence about the checked code paths. They do not establish calibrated water-detection accuracy or prove a causal connection between imagery and storage changes. See [gates](gates.md) for the recorded validation scope.

The localization update translated the main interface and README into Taiwan Traditional Chinese, retained a separate English README, and adjusted typography and accessible labels. Data values and scientific publication criteria were unchanged.
