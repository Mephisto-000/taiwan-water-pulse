# 台灣水庫的旱澇節奏｜Taiwan's Water Pulse

**繁體中文** | [English](README.en.md)

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

## 發布到 GitHub Pages

推送至 `main` 或建立 Pull Request 時會執行 CI。獨立的 **Deploy GitHub Pages** 工作流程（Workflow）僅接受手動觸發（`workflow_dispatch`）；推送不會自動部署。

請在儲存庫 **Settings → Pages** 選擇 **GitHub Actions**，再到 Actions 分頁執行部署工作流程。建置會設定 Vite 的儲存庫子路徑。部署前請確認觸發條件與環境設定；Git push 成功不代表 Pages 已啟用或可公開存取。

部署成功後的預期網址：[mephisto-000.github.io/taiwan-water-pulse](https://mephisto-000.github.io/taiwan-water-pulse/)。

在本機預覽 Pages 子路徑時，兩個指令須使用相同的 base path：

```bash
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run build
VITE_BASE_PATH=/taiwan-water-pulse/ npm --prefix web run preview
```

開啟 `http://127.0.0.1:4173/taiwan-water-pulse/`。一般根路徑建置與預覽則不設定此變數。其他主機與路徑的設定見[依賴管理文件](docs/dependency-management.md)。

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

## 授權與 AI 協作

程式碼採用 [MIT 授權](LICENSE)。第三方資料與套件各自保留原有授權；MIT 不會重新授權這些內容。[AI 使用紀錄](docs/ai-usage.md)說明程式碼、文案的產生方式與審閱範圍。
