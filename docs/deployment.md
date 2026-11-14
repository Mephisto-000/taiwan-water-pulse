# Vercel 部署與安全查核

Production：[taiwan-water-pulse.vercel.app](https://taiwan-water-pulse.vercel.app)。狀態 **READY**，2026-11-14（Asia/Taipei）完成。只對外提供此 production 網域。

## 本次部署

| 項目 | 實際值 |
| --- | --- |
| GitHub owner / repository | `Mephisto-000/taiwan-water-pulse`；維持 private，未變更可見性 |
| Vercel scope | `mephisto-000s-projects` |
| Project | `taiwan-water-pulse`；內部 project ID 不納入 repository 文件 |
| Deployment | 以 production 網域、來源 SHA 與 artifact manifest 追蹤；內部 deployment ID 不納入 repository 文件 |
| Target | `production` |
| 前端 | Vite / React，純靜態產物 |
| 來源 commit | `44019e1752645fd4198e132721bbe07031d2c103` |
| 初次部署時的來源狀態 | 部署設定當時尚未 commit；本次提交保存 README、設定與安全檢查，應用 UI 原始碼未修改 |
| Node / npm | 本機 `24.15.0` / `11.12.1`；Vercel 專案 Node `24.x` |
| Root Directory | `web` |
| 發布方式 | 本機建置及檢查後，透過已連結的 Vercel plugin 上傳靜態檔案並建立 production deployment |
| 上傳範圍 | 54 個 `web/dist` 檔案（54,308,733 bytes），另加一份不含秘密的靜態部署設定 |
| 處理耗時 | Vercel `buildingAt` 到 `ready` 約 2.715 秒，靜態輸出步驟 138 ms；本機 Vite 建置 174 ms，不包含 TypeScript 檢查 |
| Deployment Protection | Standard Protection：`all_except_custom_domains`；production 未暫時鎖定 |
| 自訂 Environment Variables | 0 筆；未上傳 Earthdata 認證 |
| 方案／費用 | 未升級、未啟用 trial 或付費附加功能。連接器未回傳 billing plan，現有帳號是否標為 Hobby 尚未獨立確認 |

來源建置設定保存在 `web/vercel.json`：`npm ci` → `npm run build && npm run check:deploy` → `dist`。本次在本機完成檢查後，API deployment 使用僅適用於編譯產物的設定：`framework: null`、空白 install/build command、`outputDirectory: "."`，並保留相同快取標頭。只有產物被傳送，沒有把 repository 根目錄當成網站目錄。

雲端日誌顯示 Vercel 平台使用 CLI `65.14.0`；本機沒有安裝 CLI 或建立 token。[檔案清單與 SHA-256](deployment-manifest.json)記錄每個公開檔案；[線上驗證結果](deployment-verification.json)記錄實際 HTTP 狀態、時間與雜湊比對。

## GitHub 與認證資料查核

2026-11-14 查核範圍為本專案可取得的所有 branch/tag 歷史、目前可提交檔案與公開產物。遠端 `main` / HEAD 與本機來源 commit 一致；遠端當時只有 `main`，完整歷史共 3 個 commit、129 個不同 blob，非 shallow clone。GitHub connector 無此 private repo 權限，因此以本機 Git 的既有認證唯讀取得遠端 refs。匿名開啟 repo 回傳 404，與 private 狀態一致。

- Gitleaks `8.30.1`：完整 Git 歷史、目前可提交檔案與 `web/dist` 均為 0 findings；報告啟用完整遮蔽。
- 本機 `token.md` 存在，`git check-ignore` 確認已忽略，且不在任一歷史 tree。認證檔解析出的 2 個值另在記憶體內與歷史 blob、公開產物做 exact-value comparison，0 matches；值未寫入報告、環境變數或部署設定。
- 未發現已提交的 `.env`、`.netrc`、`.npmrc`、私鑰或聊天紀錄檔。`.env.example` 認證欄位皆空白；測試中的示範密碼為 fixture。
- **既有 Git 歷史仍含個人資訊：** 初次部署前的三個 commit，其 author/committer metadata 含非 GitHub noreply email；舊版依賴文件含本機使用者名稱的絕對路徑。現行文件已改為實測後的專案相對路徑，但舊 commit 不會因此消失。初次 artifact 部署沒有推送 GitHub 或傳送 commit email 到 Vercel；後續的設定提交不改寫既有歷史。
- 此次不包含其他 repo、私訊服務、已刪除且無法取得的 refs、GitHub Actions artifacts/logs 或圖片 OCR。秘密掃描無法保證找出每一種自訂格式。

`.gitignore` 排除認證檔、私鑰與 `.vercel/`；`.vercelignore` 採 frontend allowlist，並排除認證與本機產物。`.vercelignore` 是 CLI 上傳規則，不能清除 Git 歷史。未來 push 前仍須審查 diff 並重跑掃描。

本次 README 與部署設定提交使用 owner 的公開 GitHub handle，以及依 GitHub 公開帳號 ID 對應的 `noreply` email，作為 author 與 committer。僅套用於這個 commit，不修改全域 Git 設定。推送前檢查 staged snapshot、Git 歷史、公開產物及本機已知認證值；報告只保留類型與位置，不記錄秘密值。

```bash
# 從 repository 根目錄執行，只輸出遮蔽後結果
gitleaks git --redact=100 --no-banner --log-opts='--all --full-history'
npm --prefix web run test:deploy
npm --prefix web test
npm --prefix web run format:check
npm --prefix web run build
npm --prefix web run check:deploy
gitleaks dir web/dist --redact=100 --no-banner
```

## 驗證結果

| 檢查 | 結果 |
| --- | --- |
| 本機測試 | 15 個前端測試、5 個部署防護測試通過；TypeScript、Prettier、正式建置通過 |
| DV-01 匿名公開可達 | 通過；未登入 Vercel 的瀏覽器可操作 production 網域 |
| DV-02 資料載入 | 通過；線上 54 個檔案皆 HTTP 200，SHA-256 全部與本機相符 |
| 互動 | 寶山第二切換鯉魚潭、HH 切換 HV、2026-03-17 切換 2026-06-21；2016 px 雷達圖與官方 82.5% 蓄水率正常顯示，所檢查流程無 console error / warning |
| DV-03 版本識別 | 通過；deployment metadata 來源 SHA 正確，公開位元組以 manifest 全量比對 |
| DV-05 快取 | `/assets/`：`public, max-age=31536000, immutable`；`/data/`：`public, max-age=0, must-revalidate` |
| DV-06 手機行動網路 | 尚未測試；目前只驗證此工作環境與匿名瀏覽器 |
| DV-07 秘密檢查 | 通過；check:deploy 與 Gitleaks 均無 findings |
| 私人路徑 | `.env`、`token.md`、`.netrc`、`.git/config`、`README.md`、`pipeline/pyproject.toml` 均為 404 |
| Runtime logs | 本 deployment 最近 15 分鐘 error/fatal 無紀錄；純靜態站沒有 application server runtime |

未啟用 Web Analytics、Speed Insights、資料庫、Function 或付費監控。Vite 有既有 MapLibre chunk 大於 500 kB 的警告；最大公開檔案約 1.42 MB，通過部署門檻。

## 更新與 Git integration

### SI 標記更新（2026-11-14）

本次 repository 更新加入首頁 SI 提示、圖示可見標記、HTML metadata、`si-usage.json`，以及 index、provenance 和官方資料 JSON 的 SI 使用欄位。本機匯出、測試與建置已驗證；原始預覽圖與觀測值未變動。這次 GitHub push 不會自動更新 production，須另行發布最新產物。上方部署 manifest 與 HTTP 驗證結果仍記錄第一次上線的版本。

匯入 private repo 時 Vercel 回傳 `repo_not_found`。現在站台已透過 artifact API 上線，**GitHub push 不會自動更新此站台**。

若日後要完成附件 §5 步驟 8，owner 需在 GitHub 的 Vercel App 權限中只授權此 repository，再將專案連結至 `Mephisto-000/taiwan-water-pulse`，保留 production branch `main`、Root Directory `web`、Vite、Node `24.x`。經明確授權提交與推送本機設定後，確認 `web/vercel.json` 生效，Environment Variables 維持空白。

目前未實測 owner push → 自動 deployment。因此 G-G 的公開可達部分通過，附件要求的完整 G-G（含 Git-trigger）仍為部分完成。下一次手動 artifact 發布必須重建、掃描，再發布至同一 Vercel project；每次更新都重做 DV-01、DV-02、DV-03。

## 回復

這是第一個 production deployment，沒有前一版可供 Instant Rollback。後續發布前保留 manifest、來源 SHA 與已驗證產物；需要時恢復上一個成功的 production deployment，或重新發布已驗證產物。Git integration 啟用後，可由 owner 透過 `git revert` 加上授權的 push 發布修正版。

平台來源：[Node.js 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[Hobby](https://vercel.com/docs/plans/hobby)、[檔案排除](https://vercel.com/docs/deployments/vercel-ignore)、[Standard Protection](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)。
