# Implementation decisions

Recorded 2026-11-14 (Asia/Taipei).

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| D-01 | Static assets and a static frontend; no runtime data backend. | The demonstration can serve cached data without exposing credentials or depending on live science services. |
| D-02 | Retain the supplied 21-granule catalog for Track 111 ascending, Frame 014, mode 4005, DHDH, P05023. | Avoid mixing acquisition geometry, processing release or the duplicate mixed-mode product. Catalog verification is recorded separately. |
| D-03 | Activate the brief's fallback level 2. | Access/structure gates G-A and G-B passed; default HH direction and both R-01 held-out tests failed. Only real browse imagery and labelled official data are published. No simulated rasters, areas or correlations fill the numerical gap. |
| D-04 | Defer threshold-based measurement, sensitivity intervals and numerical correlation. | Browse PNG values are display values, not calibrated power. Source access passed but scientific validation failed; those capabilities remain unreleased. |
| D-05 | Use Vite, React, strict TypeScript, MapLibre and an SVG chart; npm for the frontend, Python/uv for the pipeline. | Keep the requested stack, using native SVG for the small chart instead of a separate chart dependency. NumPy supports tested pure numerical primitives; Earthdata/HDF5/geospatial dependencies were subsequently added to investigate numerical access and processing. Their installation does not imply validated radar output. |
| D-06 | Use Vercel as the sole static host; superseded by DD-01 below. | The current user explicitly authorized Vercel deployment. Keep GitHub private and credentials local. |
| D-07 | MIT for project code. | Adopt the brief's default. Third-party data and package licenses remain separate. |
| D-08 | Publish the fresh cached WRA series; preserve and label the supplied seed separately. | A bounded 45-request refresh produced 88 sampled dates per station. One 0.01 m seed/live level discrepancy is documented and the actual response takes precedence. The seed remains a reproducible fallback. |
| D-09 | Display full-frame browse imagery separately from the geographic locator. | Browse images are not treated as georeferenced analysis layers. Selecting a reservoir changes the context and gauge data without asserting a validated per-reservoir radar measurement. |
| D-10 | Keep missing observations explicit. | No radar observation is fabricated during 2026-03-18 through 2026-06-20; null official values remain null. |
| D-11 | Use Node.js 24 LTS and Python 3.14. | Both were available locally and supported at implementation time. Pin the selected runtime families and commit lock files; exact observed versions are recorded in dependency management. |
| D-13 | Gate numerical UI behind validated exported metadata. | Numerical controls are prepared, but the released manifest stays in browse mode after both held-out classifiers failed. There is no client-side switch that substitutes browse pixels for calibrated values. |
| D-14 | Freeze the R-01 candidate before held-out validation. | Calibrate on four fixed dates, then evaluate the other 17. Proposed Baoshan II classification is HV with the unbuffered OSM polygon; Liyutan retains HH with 150 m buffer. These depart from the original all-HH rule. Require held-out area-versus-level Spearman ≥0.8 for both with sample counts before enabling a partial numerical release. Actual results were 0.421569 and 0.436810 (n=17 each): both failed, so the partial numerical release was rejected. |
| D-12 | Traditional Chinese Conventional Commit message. | The user explicitly selected this language for the initial commit. No AI signature trailer is added; assistance is recorded in ai-usage.md. |

The fallback is a scoped initial release, not completion of the original numerical acceptance criteria. Authenticated access and actual HDF5 inspection have passed. The completed held-out investigation rejected quantitative publication. A later method needs new independent validation before revisiting D-03 and D-04; the already-inspected 17 dates cannot be reused as an untouched test set.

## Language update

The user requested Traditional Chinese and English README versions and a Traditional Chinese main interface. `README.md` is the Taiwan Traditional Chinese entry point; `README.en.md` retains the English version, with reciprocal links. UI copy, dates, accessible labels and error messages use Taiwan terminology, with English technical terms where useful. This supersedes the original brief's English UI/README assumption. Scientific results and publication gates are unchanged.

## Vercel deployment decisions

| ID | Decision | Reason and evidence |
| --- | --- | --- |
| DD-01 | Vercel only; no backup host or GitHub Pages workflow. | Current user request and supplied deployment guide. |
| DD-02 | Existing owner: GitHub `Mephisto-000`; Vercel scope `mephisto-000s-projects`. | Existing Git origin and authenticated Vercel connector. |
| DD-03 | Keep the GitHub repository private. | No visibility change is authorized or necessary. |
| DD-04 | Project name `taiwan-water-pulse`. | Created in the existing Vercel scope; actual production domain is recorded in deployment.md. |
| DD-05 | Intended production branch `main`; initial release uses checked static artifacts. | Vercel's Git integration cannot currently access the private repository. No Git push is needed for the artifact release. |
| DD-07 | Standard Protection (`all_except_custom_domains`). | Production domain is public; individual deployment URLs remain protected. |

The initial deployment uses the authenticated Vercel file-upload/deployment API instead of installing a CLI or creating a token. It uploads only the 54 checked frontend output files and a static deployment configuration. The source commit and artifact manifest identify the release. Source build settings remain documented for a later authorized Git integration. No commit author is rewritten and no identity restriction is bypassed.

Existing ASF browse filenames retain their `HH`/`HV` polarization suffixes. The deploy checker compares references against actual directory entries, including case, even on macOS; this prevents case-related production 404s without renaming previously exported scientific assets. Empty manifests warn, while the current release verifies every browse, official-data and provenance asset.


## Intermediate review decisions (superseded where stated below)

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| RV-01 | Supersede initial browse-only D-03/D-04/D-09/D-13 with calibrated reservoir views and per-reservoir descriptive grades. | Complete four-reservoir 21-date HH/HV caches are available. Failed historical independent experiments stay recorded as failures; current grades do not claim an untouched test set. |
| RV-02 | Fixed HH primary, exact OSM mask and all-image pooled Otsu without the old threshold clamp. | The review calls for image-only thresholds; no official values enter calibration and no per-date/channel optimization against correlation is allowed. All actual results are retained, including Shimen C. |
| RV-03 | C suppresses quantitative UI even when calibrated images are available. | Shimen fails both the direction check and whole-series correlation. Baoshan II and Feitsui B remain explicitly experimental; Liyutan A is a review grade, not measured segmentation accuracy. |
| RV-04 | Preserve original browse PNGs in pipeline assets and publish 384-pixel context overviews. | Keep exact original hashes/offline reproduction while the site prioritizes reservoir-scale calibrated grids and stays below 90 MB. |
| RV-05 | Separate NASA authentication from anonymous CDN Range requests. | Source now redirects to a short-lived download URL. Credentials only reach the original NASA host. A separate request with no Authorization reaches the explicitly allowed CDN; temporary links are never persisted. |
| RV-06 | Capture source revision/dirty state before any export mutation. | A clean code commit can be referenced by a subsequent reproducible data commit without falsely labelling uncommitted implementation as clean. |
| RV-07 | Keep all source and validation links accessible on the static site. | GitHub remains private; public users can inspect methodology and both current/historical validation reports without changing repository visibility. |
| RV-08 | Define polarization comparison as spatial shoreline contrast, not threshold-separated truth. | Use OSM interior versus a fixed 150–300 m exterior ring and report sample counts. Neither group is ground-truth water/land; the UI must not call this segmentation accuracy. |


## Final relative-power release decisions

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| RV-09 | Supersede RV-02 and the Otsu-specific result in RV-03 with HH / 0.6× local reference power / 0 m OSM buffer. | Follow the user-directed sequential audit. Channel, relative threshold and buffer are common and not fitted to official records. Preserve Otsu v2 as an intermediate report. |
| RV-10 | Keep fine display imagery and a separate native 30 m analysis grid. | Linear averaging precedes log. 30 m is the finest listed scale meeting A for both core reservoirs; 10 m also has strong r but one interval fails A. This scale choice used exploratory results and must not be called independent validation. |
| RV-11 | Publish Shimen B with LOW_CONFIDENCE, not as a dependable association. | Its literal r-based grade is B, but its interval spans zero and rho is near zero. All results/uncertainty remain visible; the method is not adjusted to improve Shimen. |
| RV-12 | Keep the exposed-bed explanation a hypothesis. | HH-selected transition pixels retain lower HV contrast, but selection bias and lack of independent ground truth prevent a causal or misclassification claim. Publish candidate/stable/reference comparisons. |
| RV-13 | Use ratios 0.5/0.7 for sensitivity and per-date absolute dB cutoffs. | The final threshold is relative to same-date reference power, so the old fixed ±1.5 dB band is superseded. CSV, metadata, UI and cross-language checks must use the analysis grid and ratios consistently. |

## 2026-11-14 第二次科學審閱

| ID | 決定 | 查證與影響 |
| --- | --- | --- |
| RV-14 | 依 VAL-09/10 加入效應大小與正值信賴區間，取代 RV-11。 | 分類方法保持 HH、30 m、0.6、OSM 0 m buffer。全日期重算為寶山第二 A、鯉魚潭 A、石門 C、翡翠 B。石門不再發布 UI／CSV 面積；翡翠的方向一致，但變化小於方法敏感度。 |
| RV-15 | 主統計保留所有日期，另報每個極化排除 QA 旗標的結果。 | 旗標採全日期陸地中位數偏差 >2 dB，或 ≥99.5% 蓄水日期面積低於滿庫中位數減 3 MAD，另保留 valid fraction 規則。寶山 HV 同時標出 2025-11-17 與 2026-07-03；排除後 r=0.89785、n=19，與文件僅排除單一天的 0.88 不同，不縮減旗標集合來配合預期。 |
| RV-16 | 直接使用原始官方 Capacity 的日期間差值做水量閉合。 | WRA 官方前端 JavaScript 將 Capacity 標為有效蓄水量（萬立方公尺）；轉換為 m³ 的倍率為 10,000。歷史資料仍來自原有 GetComparision cache。CAPACITY_E 全為 null，維持 null，不從蓄水率或新聞容量推算。單位證據、日期與檔案 hash 見 methods.md 及 official JSON。 |
| RV-17 | 水量閉合只報告，不影響等級。 | 純函式保留時間順序與帶符號水位差，第一個連續區塊遇 >36 天觀測間隔即結束；只對 ≥10 m 水位差且效應大小通過者顯示。寶山官方差 24.2772 百萬 m³，鯉魚潭 66.7951 百萬 m³，後者與附件新聞容量粗算 66.64 百萬 m³ 不同。 |
| RV-18 | 擴大敏感度檢查，但不重選發布門檻。 | 同一 30 m HH 分析格網列出陸地中位數 −2 至 −6 dB 及逐日期 polygon Otsu 的面積與相關。更正 0.6 起源為預覽顯示值的粗估；它是選定定義，非校準功率的物理水陸分界。 |
| RV-19 | 顯示與量化完全分離。 | HH 顯示 −18 至 −2 dB；HV 合併所有有效顯示像素的 2%/98% 分位為 −20.3543/−6.8110 dB，向外取整為 −21/−6 dB，所有日期共用。既有 −35 至 +5 dB byte encoding 與分類資料不變。 |
| RV-20 | 滿庫重複性採 population SD（ddof=0）。 | 明示定義並保留 n；少於兩筆時 SD 與 range 為 null。這是滿庫觀測的變異，不稱為已分離的儀器誤差。翡翠全部 21 筆平均敏感度寬重算為 0.278229 km²，與附件的 0.275 不同，以流程結果為準。 |
| RV-21 | 事件日期與報導日期分開紀錄，只採讀取核對過的來源。 | 2026-11-14 查核：S-01 是 2026-04-05 報導、事件為 4/2–4/5；S-03 是 5/27 報導、實施日期為 5/26，補上經濟部水利署 5/26 原始公告。S-04 的 2026 年巴威並非錯年，氣象署資料庫確認編號 202609、近臺日期 7/11；但附件聲稱所有事件都在雷達缺口中不正確，7/10–7/11 已在長期缺口之後。S-02 直接讀取兩次均無法取得全文，不作發布證據。完整來源與查核狀態保留於 pipeline/assets/review-events.json 及站內 events.json，事件僅作來源歸屬的背景，不推論雷達量到的因果。 |

## ADV-10 兩段式蓄水率估計

| ID | 決定 | 定義、查證與影響 |
| --- | --- | --- |
| EST-01 | 分類、等級與發布面積不變，只有 A 級可做 Align。 | 依 06 DEF-06/11，全部官方蓄水率 ≥99.5% 的日期（含 QA 旗標）計算 μ 與 sample SD（ddof=1），固定 μ−2σ，至少 3 筆滿庫日期。這不修改 RV-20 原有的 population SD 描述。B、C 級同時停用兩段式與直線對照，但保留方法對話框說明原因。 |
| EST-02 | 退水期固定為既有長缺口開始前的觀測。 | 以 UTC acquisition date < `index.json.gap.start` 定義，本批為前 11 筆。用最後一筆仍在滿庫範圍內的觀測作 anchor，加上範圍外退水點依面積排序內插；不依誤差挑選期間、門檻、N，亦不抹平鯉魚潭的反向面積點。2σ 是正式規則，3σ 只報最早偵測的敏感度結果。 |
| EST-03 | DEF-12 兩類結果分開，保留描述性分類限制。 | 高類下限取該類官方蓄水率最小值，因而 false-high=0 是樣本內定義的結果，不稱為獨立分類準確度。寶二高類 15 筆、下限 71.3623%、1 次 false-low（2026-07-04，官方 100%）；鯉魚潭 16 筆、下限 68.0981%、0 次誤判。誤判日含 QA，不刪除。 |
| EST-04 | 低水位逐一留出，圖上完整模型的校正點明示身分。 | 每庫 5 次，留出點不得進入該次插值校正；滿庫門檻與 anchor 固定。寶二 MAE 5.1744、max 9.2150；鯉魚潭 3.9826、max 10.3904 個百分點，重現 06 四捨五入的 5.2／4.0。完整模型會穿過校正點，不把圖上的訓練吻合度當評估。 |
| EST-05 | 誤差線採本庫估計值 ±LOO 最大絕對誤差，裁至 0–100%。 | 06 要求數值與範圍，但未指定區間公式。此處固定選描述性誤差範圍並記錄，不是信賴區間、保證範圍或新參數搜尋。跨兩庫低水位 MAE 4.5785 只可說平均約 4.6 個百分點；最大誤差 10.3904，不能把 §4 的「±5」寫成逐日精度保證。 |
| EST-06 | 「上一次官方值」基準嚴格限定相隔 12 個台灣日曆日。 | 實際時間戳有秒級漂移，因此按 local date 差計算；不跨長缺口，也不把 24 天當 12 天。n=17 的寶二／鯉魚潭 MAE 為 4.4607／4.3833（4.5／4.4）。06 的鯉魚潭 4.3 與重算不同；含兩個 24 天間隔的 n=19 會得到 4.3255，可解釋參考值，但不為對齊參考而變更正式 cohort。 |
| EST-07 | 最早偵測與估計誤差分開報告。 | 兩庫 μ−2σ 最早日期均為 2026-01-29（台灣），官方蓄水率 65.6791%／63.9088%；μ−3σ 為 2026-02-10，58.0496%／59.2261%。與 06 的日期及四捨五入數字一致；只回顧單一退水事件，未經下一次事件驗證。 |
| EST-08 | 完成 gate 不另造精度門檻，完成評估後另取得發布授權。 | DEF-12 僅規定評估內容，未訂 MAE 或誤判率合格線。gate 檢查計算完整、每次留出隔離與資料一致性，通過不等於獨立科學驗證。評估未完成不可啟用。實作階段依要求先不 push／部署，回報後使用者明確授權合併至 `main`、push 與部署；功能來源 `e33cf7a` 已合併、推送並部署為 READY，線上查核已通過。採英文 Conventional Commits，發布證據另見[最新發版紀錄](deployment.md#最新發版adv-10)。 |
| EST-09 | §4 保留 Grade／Align 兩步與無即時水位資料的使用情境，修正精度及比較語句。 | 七成改為本批高類下限範圍 68.1–71.4%，最早偵測為 63.9–65.7%；平均誤差 4.6 與最大 10.4 個百分點分開說，不用「±4.6」當保證。「比不上一個水位計」改為「不能取代水位計」：全年嚴格 12 天基準與低水位 LOO 不是同一 cohort。另列相同 5 日期的 previous-official baseline（8.6345／6.7446）供比較；即使本批兩段式誤差較低，也不是與即時水位計精度的直接比較。 |
