# 台灣水庫的旱澇節奏｜Taiwan's Water Pulse

**繁體中文** | [English](README.en.md)

**線上展示（免登入）：** [https://taiwan-water-pulse.vercel.app](https://taiwan-water-pulse.vercel.app)

透過 NISAR 首年的 L 波段雷達（L-band radar）影像與水利署官方觀測，回顧台灣水庫的退水與回補。主要介面採用台灣慣用的繁體中文，必要技術名詞附上英文。

初版依實作規格採用**預覽圖備援方案（Browse edition）**：提供四座水庫、21 個取像日期、HH／HV 預覽圖、每座水庫 88 個日期的官方取樣值，以及可追溯的資料來源。預覽圖僅供目視比較，不能當作校準後的像素值來量測水面積。

**本版不提供雷達水面積、門檻疊圖、敏感度範圍或面積與水位的相關係數。** 雖然認證後的 HDF5 資料已成功讀取，但固定門檻方法未通過另外 17 個日期的獨立驗證，因此不發布數值結果。

![寶山第二水庫的互動探索畫面](docs/submission/04-traditional-chinese.jpg)

[代表性畫面與說明](docs/submission/screenshots.md)。

## 為什麼不發布水面積結果？

從單一資料產品（Granule）讀取四座水庫的研究區（AOI）視窗，耗時 91.279 秒，沒有下載整個檔案；已查核實際投影、座標、填補值與遮罩屬性。原先的 HH 方法未呈現預期的「滿庫 → 退水」方向。接著以四個校準日期固定替代方法，再用其餘 17 個日期驗證，不重新調整門檻。

| 水庫 | 固定分類方法 | 獨立驗證：面積對水位的 Spearman ρ | 配對樣本數 n | 標準 |
| --- | --- | ---: | ---: | ---: |
| 寶山第二 | HV，未加緩衝區的 OSM 多邊形 | 0.422 | 17 | ≥0.8 |
| 鯉魚潭 | HH，外擴 150 m 的多邊形 | 0.437 | 17 | ≥0.8 |

兩者均未達標。上述數字是可重現的失敗方法診斷，**不是通過驗證的水面積量測**。完整紀錄見[校準設定](pipeline/assets/numeric-calibration.json)、[獨立驗證報告](pipeline/assets/numeric-validation.json)與[關卡證據](docs/gates.md)。介面保留真實影像與官方觀測，明確揭露限制。

## 在本機執行

需求：Node.js 24 LTS（`>=24.15.0`）、npm 11、Python 3.14 與 uv。依賴套件安裝於專案內，不必安裝全域套件。

以下指令皆從儲存庫根目錄執行：

```bash
uv sync --project pipeline --frozen
npm --prefix web ci
uv run --project pipeline water-pulse all --offline
npm --prefix web run dev -- --host 127.0.0.1
```

開啟 Vite 顯示的本機網址。預覽影像與資料已納入版本控制，展示時不會向 NASA 或水利署查詢；底圖圖磚仍使用外部服務。

```bash
# 檢查離線處理流程與前端
uv run --project pipeline pytest pipeline/tests
uv run --project pipeline ruff check pipeline
npm --prefix web test
npm --prefix web run format:check
npm --prefix web run build

# 預覽正式建置結果
npm --prefix web run preview -- --host 127.0.0.1
```

## 更新與重現資料

```bash
# 僅顯示預定工作，不連線也不寫入檔案
uv run --project pipeline water-pulse all --dry-run

# 使用已納入版本控制的資料重建，不存取外部服務
uv run --project pipeline water-pulse all --offline

# 更新公開目錄、水庫邊界、官方資料與預覽圖
uv run --project pipeline water-pulse all --refresh

# 指定水庫與 UTC 取像日期
uv run --project pipeline water-pulse export --offline \
  --reservoirs baoshan2,liyutan --dates 2025-11-05,2026-03-17,2026-06-21
```

CLI 另提供 `discover`、`geometry`、`official`、`export` 與 `gates`。`all` 建置的是預覽圖備援版本；執行成功不代表數值驗證通過。數值功能程式碼保留供研究，但在目前發布資料中停用。詳見[方法](docs/methods.md)與[關卡證據](docs/gates.md)。

指定部分資料匯出會取代目前的匯出範圍；再次執行 `all --offline` 可還原完整展示內容。

若要重現失敗的數值實驗，請先在本機環境變數設定 Earthdata 認證，再執行：

```bash
uv run --project pipeline water-pulse read --reservoirs baoshan2,liyutan
uv run --project pipeline water-pulse process --reservoirs baoshan2,liyutan --offline
# 預期結束代碼為 2：原先四日期的 HH 方向檢查失敗
uv run --project pipeline water-pulse gates --offline
# 預期結束代碼為 2：兩種分類方法的獨立驗證未達標
uv run --project pipeline water-pulse measure --reservoirs baoshan2,liyutan --offline
# 同樣以結束代碼 2 拒絕發布，保留預覽圖版本
uv run --project pipeline water-pulse export --numeric --reservoirs baoshan2,liyutan --offline
```

原始視窗與候選數值影像存放於已忽略的 `data/cache/`。CLI 可透過 `--credentials-file` 指定本機認證檔；請勿將認證檔提交至版本控制。重現公開的預覽圖版本不需要 Earthdata 帳號。

## 可以探索什麼？

- 切換寶山第二、鯉魚潭、石門與翡翠水庫，對照同次取像的官方觀測。
- 選擇實際存在的取像日期、播放時間序列，或使用鍵盤方向鍵切換。
- 切換 NISAR 實際量測的 HH／HV 極化通道（Polarization）。
- 查看官方曲線、雷達觀測缺口與各筆資料來源。
- 跟隨五幕故事，比較西部水庫與翡翠水庫的不同節奏。

官方觀測時間為台灣時間 07:00。NISAR 約於 UTC 21:16 取像，對應台灣隔日約 05:16，比官方觀測早約 1.7 小時。官方缺值保持留白；取樣值之間的連線僅協助閱讀，不代表新增觀測。

## 發布到 Vercel

正式網站已部署至 **[taiwan-water-pulse.vercel.app](https://taiwan-water-pulse.vercel.app)**，含 SI 標記的版本於 2026-11-14 12:59（Asia/Taipei）重新上線，已完成免登入存取、互動操作與 55 個公開檔案的驗證。

本專案只使用 Vercel，GitHub repo 維持 private。目前採用本機建置、檢查後上傳靜態產物的方式發布；GitHub 自動部署尚未連結，push 不會自動更新網站。網站公開內容只有通過檢查的 `web/dist`；Earthdata 認證、本機快取、Python pipeline 與私訊不屬於網站產物。

```bash
npm --prefix web run test:deploy
npm --prefix web test
npm --prefix web run build
npm --prefix web run check:deploy
```

日後啟用 Git 自動部署時，來源建置設定使用 Root Directory `web`、Node.js `24.x`、`npm ci`；`web/vercel.json` 定義建置與快取。部署不需要帳號密碼或自訂環境變數。部署方式、安全檢查、更新與回復步驟見[部署紀錄](docs/deployment.md)。

## 專案結構

```text
pipeline/                 Python CLI、來源快照與數值測試
web/                      Vite + React + strict TypeScript 靜態前端
web/public/data/          納入版本控制的同源資料、預覽圖與來源紀錄
README.md                 繁體中文說明
README.en.md              英文說明
docs/                     方法、資料來源、關卡與決策紀錄
docs/submission/          英文作品介紹草稿與 30 秒展示腳本
data/cache/               不納入版本控制的本機工作資料
```

## 資料來源與科學限制

NISAR 為 NASA/JPL 與 ISRO 的聯合任務，資料由 ASF DAAC 發布。本專案使用 `NISAR_L2_GCOV_PROVISIONAL_V1`、升軌 Track 111、Frame 014、mode 4005、HH/HV、CRID P05023。產品成熟度為 **Provisional**，軌道精度旗標為 near-real-time。預覽圖的顯示亮度不能視為校準後的 γ⁰ 數值，放大也不會增加真實細節。

官方蓄水率與水位來自經濟部水利署防災資訊服務網，曲線使用 2026-11-14 台灣時間 11:02 擷取的查詢回應快取；附錄的 25 日期種子資料另外保留作為備援與完整性檢查。水庫幾何邊界來自 © OpenStreetMap contributors，採 ODbL 授權。OSM 水域邊界只提供脈絡，不是驗證真值。來源網址、擷取時間與限制見[資料來源](docs/data-sources.md)及匯出的來源紀錄（Provenance）。

風浪、降雨、漂流物、平滑裸露岸地、疊置（Layover）、雷達陰影（Shadow）與斑點雜訊（Speckle）都可能影響水體判讀。**水面積不等於蓄水量**；本專案不推估水量，也不從相關性推論因果關係。

## 維護依賴套件

```bash
# 檢視可更新版本；確認更新範圍後再更新與測試
npm --prefix web outdated
npm --prefix web update
npm --prefix web test
npm --prefix web run format:check
npm --prefix web run build

# 更新 Python 鎖定版本，還原環境並測試
uv lock --project pipeline --upgrade
uv sync --project pipeline --frozen
uv run --project pipeline pytest pipeline/tests

# 移除套件，將 PACKAGE_NAME 換成實際名稱
npm --prefix web uninstall PACKAGE_NAME
uv remove --project pipeline PACKAGE_NAME
```

依賴變更時，請一併提交 `web/package-lock.json`、`pipeline/uv.lock` 與對應設定檔。開發用套件使用 `npm install --save-dev` 或 `uv add --dev`。實際版本、查證過的安裝位置、環境變數與常見問題見[依賴管理文件](docs/dependency-management.md)。

## SI 使用揭露與授權

**SI-generated / SI-assisted：** OpenAI Codex 協助產生前端與 Python 程式碼、測試、介面文案、翻譯、文件及資料整理流程。網站提供可見揭露，HTML、匯出資料與 [si-usage.json](si-usage.json) 提供可機讀 metadata；完整範圍見 [SI 使用紀錄](docs/ai-usage.md)。

這些標記已於 2026-11-14 發布至 production，網站可直接查看。Vercel 尚未連動 GitHub 自動部署，後續更新仍採檢查後發布靜態產物的方式。

NASA／ASF 雷達預覽圖、水利署觀測與 OpenStreetMap 資料來自原始來源，並非 SI 生成；匯出資料的 SI 標記指整理程式與流程。自訂 SVG 圖示以 SI 協助產生，已加上可見標示及 metadata。現有截圖是瀏覽器實際畫面，目前沒有生成式雷達圖片、音訊或影片。後續若加入 SI 生成影像或影片，須有可見的 `SI-generated` 浮水印；SI 音訊須在說明與 metadata 揭露。

程式碼採用 [MIT 授權](LICENSE)。第三方資料與套件保留原有授權。自訂圖示不使用 NASA 品牌標誌；任務名稱與機構署名僅用於資料來源說明，不代表官方背書。自動測試不代表獨立科學審查。
