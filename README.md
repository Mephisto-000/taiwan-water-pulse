# 台灣水庫的旱澇節奏｜Taiwan's Water Pulse

**繁體中文** | [English](README.en.md)

**公開網站：** [taiwan-water-pulse.vercel.app](https://taiwan-water-pulse.vercel.app) · [English](https://taiwan-water-pulse.vercel.app/?lang=en) · [繁體中文](https://taiwan-water-pulse.vercel.app/?lang=zh-TW) · [30 秒導覽](https://taiwan-water-pulse.vercel.app/?demo=1)

以 NISAR 首年的 L 波段雷達與水利署官方觀測，回顧四座水庫的退水與回補。介面依瀏覽器語言預設中文或英文，也能透過 `?lang=en`、`?lang=zh-TW` 切換。這是歷史觀測展示，不是即時監測。

## 這次改進

- 四座水庫、21 個取像日期的真實 GCOV HH／HV 局部影像，固定格網、北向上、比例尺、OSM 參考輪廓與固定 γ⁰ 色階。
- 可拖曳、可用鍵盤操作的兩日期比較；影格列與依真實間距排列的時間軸保留觀測缺口。
- 雷達實驗性面積與官方蓄水率分成上下圖；散布圖、敏感度範圍、分級與完整驗證報告可查。
- 數值方法依水庫分級；未通過的水庫保留校準影像，不展示面積或分類疊色。
- 五幕故事、英文自動導覽、CSV 下載、Open Graph 分享預覽、較大字級與更清楚的對比。
- 移除 MapLibre 與外部圖磚；使用同源資料、Canvas 和 SVG，不新增依賴。

![真實 GCOV HH 影像前後比較](web/public/social-preview.jpg)

## 方法與驗證

原始資料使用 `NISAR_L2_GCOV_PROVISIONAL_V1`、升軌 Track 111、Frame 014、mode 4005、CRID P05023。影像格網與分類尺度分開記錄；像素間距不等於有效解析度，放大不會產生新的細節。

門檻、分析尺度、相關係數、bootstrap 區間、物理檢查與逐庫發布決定，以[目前方法](docs/methods.md)、[驗證說明](docs/validation.md)和[關卡紀錄](docs/gates.md)為準。網站也提供免登入的[方法](https://taiwan-water-pulse.vercel.app/data/methods.md)與[驗證報告](https://taiwan-water-pulse.vercel.app/data/validation.json)。

舊方法未通過的結果仍保留：[原校準設定](pipeline/assets/numeric-calibration.json)、[原獨立驗證](pipeline/assets/numeric-validation.json)。舊切分使用跨越缺口的 4 個校準日期，其餘 17 個日期驗證；並不是只把滿庫期間當成驗證集。新方法的探索性評估不會宣稱是新的獨立 held-out 驗證。

**水面積不等於蓄水量，相關性不代表因果。** 官方曲線是 88 個日期的取樣，並非完整每日資料。NISAR 約於台灣時間 05:16 取像，與同日 07:00 官方紀錄配對；缺值不補零、不內插。2026-03-18 至 2026-06-20（UTC）無此影幅的雷達產品。

## 本機啟動

Node.js `24.15.0`／npm `11.12.1`；Python pipeline 使用 `3.14.10`／uv `0.13.8`。依賴安裝於專案內，版本分別鎖在 `web/package-lock.json` 與 `pipeline/uv.lock`。

```bash
# 從儲存庫根目錄執行；網站資料已納入版本控制
npm --prefix web ci
npm --prefix web run dev -- --host 127.0.0.1

# Python 環境僅供重建與測試
uv sync --project pipeline --frozen
```

開啟 Vite 顯示的網址。啟動網站不需要 Earthdata 帳號或 Vercel token，也不需要執行資料匯出。

```bash
uv run --project pipeline pytest pipeline/tests
uv run --project pipeline ruff check pipeline
npm --prefix web test
npm --prefix web run test:deploy
npm --prefix web run format:check
npm --prefix web run build
npm --prefix web run check:deploy
npm --prefix web run preview -- --host 127.0.0.1
```

## 重建資料

校準原始 AOI 快取位於忽略的 `data/cache/`，不隨 GitHub 或 Vercel 發布。重建需先從來源取得快取；將 Earthdata 認證設於本機環境變數，或使用忽略的本機認證檔，勿寫入程式碼。

```bash
uv run --project pipeline water-pulse read \
  --reservoirs baoshan2,liyutan,shimen,feitsui

# 快取齊全後可離線重建；從乾淨 commit 執行，記錄真正的來源版本
uv run --project pipeline water-pulse release --offline
```

`release` 是目前網站的匯出入口。`all --offline`、`export --offline` 保留作為舊 Browse 備援流程，會取代展示清單；它們不是新版的重建指令。更新官方資料或來源目錄前，先檢視 `--dry-run` 與[來源說明](docs/data-sources.md)，避免不必要請求。

## 部署與隱私

GitHub repo 維持 private。公開介面不連到私有原始碼頁，而是使用同源的方法、驗證與 provenance。推送 GitHub 不會自動部署；目前在本機建置及安全檢查後，透過 Vercel plugin 上傳靜態 `web/dist`。

Vercel 不需要任何 Earthdata 認證或自訂環境變數。`.env`、`token.md`、私密金鑰、原始快取與本機設定不屬於部署產物。發布前掃描待提交內容和建置結果；只上傳通過 `check:deploy` 的檔案。正式網址、來源 commit、檔案雜湊與驗證結果見[部署紀錄](docs/deployment.md)。

## 依賴管理

```bash
# 先確認相容性、安全性與變更範圍，再更新
npm --prefix web outdated
npm --prefix web update
uv lock --project pipeline --upgrade
uv sync --project pipeline --frozen

# 移除指定套件，同步更新 manifest 與 lock file
npm --prefix web uninstall PACKAGE_NAME
uv remove --project pipeline PACKAGE_NAME
```

安裝、還原、升級、移除、環境變數、實際查證的安裝位置與常見問題，見 [docs/dependency-management.md](docs/dependency-management.md)。更新套件後重新執行相關測試與建置，勿混用 package manager。

## SI 使用與授權

**SI-generated / SI-assisted：** OpenAI Codex 協助程式碼、測試、文案、翻譯、文件及資料整理。網站有可見揭露，[si-usage.json](si-usage.json) 提供可機讀範圍；SVG 圖示與定位示意另有標記。科學圖表由真實觀測計算，並非生成式雷達影像。瀏覽器截圖保留來源與 SI 輔助視覺化說明。

NASA／ASF 雷達、水利署觀測與 OSM 幾何是原始來源資料，不是 SI 生成。自動檢查不代表獨立科學審查。詳見 [SI 使用紀錄](docs/ai-usage.md)。

程式碼採 [MIT](LICENSE)。NISAR 署名 NASA/JPL & ISRO、ASF DAAC；水庫邊界 © OpenStreetMap contributors（ODbL）；官方觀測來自經濟部水利署。未使用 NASA 品牌圖案，也不表示官方背書。
