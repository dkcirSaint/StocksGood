# 荷包股股・StocksGood

查詢台股的網頁程式。輸入**股票名稱或代號**，即可看到：

1. **近三個月的月營收增長**（月增率 MoM、年增率 YoY）
2. **近兩季的季報**（營收、毛利、營業利益、稅前/稅後淨利、EPS）
3. **公司最近的法說會 / 股東會**時間；若已舉行，提供法說會**簡報內容（PDF）**與影音連結
4. **K 線／MACD 分析**，以及（選用）**Gmail Email 通知**

## 技術架構

- **Next.js 14（App Router）+ TypeScript**：前後端一體，可部署到 Vercel（serverless，免自架伺服器）。
- 後端 API Route（`/api/stock`）負責對外取資料，避免瀏覽器 CORS 問題：
  - **FinMind API** → 股票清單、月營收、季報、日價
  - **公開資訊觀測站 MOPS（mopsov.twse.com.tw）** → 法人說明會時間、地點、擇要訊息、簡報 PDF、影音連結
  - **Gmail SMTP（nodemailer）** → 單人自用 Email 通知

```
瀏覽器 (app/page.tsx)
   │ GET /api/stock?q=台積電
   ▼
Next.js API Route (app/api/stock/route.ts)
   ├─ lib/finmind.ts ── 月營收、季報、股票查詢
   └─ lib/mops.ts ───── 法說會時間 + 簡報/影音連結
```

## 專案結構

| 路徑 | 說明 |
| --- | --- |
| `app/page.tsx` | 查詢頁面與結果呈現（client component） |
| `app/api/stock/route.ts` | 聚合查詢的 API endpoint |
| `app/api/notify/*` | Email 通知：同步設定／測試寄信／掃描 |
| `lib/finmind.ts` | FinMind 串接：股票查詢、月營收增長、季報 |
| `lib/mops.ts` | MOPS 法說會爬取與解析 |
| `lib/notify/*` | Gmail 寄信、設定檔、去重、掃描 |
| `lib/types.ts` | 共用型別 |

## 本機開發

> 需求：Node.js 18+ 與 npm。

```bash
# 1. 安裝相依套件
npm install

# 2.（選填）設定 FinMind token，提高呼叫額度
cp .env.example .env
#   編輯 .env 填入 FINMIND_TOKEN（沒有 token 也能運作）

# 3. 啟動開發伺服器
npm run dev
# 開啟 http://localhost:3000
```

## Email 通知（Gmail／單人自用）

低噪音事件：

1. 關鍵價格觸價
2. MACD（可分別勾選，任一觸發即通知）
   - 戰術：短波段轉弱／轉強、剛金叉／剛死叉
   - 結構：頂背離／底背離
   - 進出場：有效待確認／已確認可進場／已失效
3. 行事曆（事件當天～前 3 天）

### 設定步驟

1. Google 帳號開啟[兩步驟驗證](https://myaccount.google.com/security)，並產生[應用程式密碼](https://myaccount.google.com/apppasswords)。
2. 在 `.env` 填入：

```bash
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NOTIFY_TO=you@gmail.com          # 可省略，預設同 GMAIL_USER
NOTIFY_CRON_SECRET=自訂密鑰      # 建議設定，保護掃描 API
NOTIFY_ENABLED=true
```

3. 重啟 `npm run dev`。
4. 開啟網站右上角 **通知**：
   - 可看到「開發伺服器：運作中」＝目前有開
   - **啟用登入自動啟動**（或儲存定時時會一併嘗試啟用）
   - **同步目前追蹤清單**、**測試寄信**、**立即掃描一次**
   - 設定最多 3 組定時（台灣 HH:mm）並按「儲存定時」

同一事件每次掃描都會再寄一次（不再因「已通知過」而略過）。

> 能打開網頁就代表 `npm run dev` 有在跑。關閉終端或休眠後定時不會執行；可用「登入自動啟動」在登入 Mac 後自動開伺服器。

### 本機定時掃描（crontab）

在「通知」視窗可輸入每天最多 **3 組** 掃描時間（台灣時區 HH:mm），並按「儲存定時」。

本機 crontab **每分鐘** 檢查是否到點：

```bash
# 檢視
crontab -l
# * * * * * .../scripts/notify-cron.sh

# 手動測試一次（會依目前時刻決定是否掃描）
bash scripts/notify-cron.sh

# 日誌（僅實際掃描或錯誤時寫入）
tail -f data/notify-cron.log
```

開發伺服器需開著，且電腦未休眠。若三格時間都留空，則不定時掃描（仍可用「立即掃描一次」）。

或直接強制掃描（略過時刻檢查）：

```bash
curl -X POST -H "Authorization: Bearer 你的密鑰" http://localhost:3000/api/notify/scan
```

> 注意：此方案依賴本機 `data/notify-*.json`。若部署到 Vercel 等無狀態環境，設定檔不會持久，需另接 KV／DB。
> 電腦休眠時 cron 不會準時執行。

## 部署到 Vercel（免自架伺服器）

1. 將此專案 push 到 GitHub。
2. 於 [vercel.com](https://vercel.com) 匯入該 repo。
3.（選填）在 Vercel 專案的 Environment Variables 加入 `FINMIND_TOKEN`。
4. Deploy 即可，API Route 會以 serverless function 執行。

> Email 通知第一版以本機自用為主；Vercel 部署需額外持久化儲存，尚未內建。

## 資料說明與限制

- **月營收**：FinMind 提供發布月份對應之實際營收月份；YoY 需有去年同月資料才會顯示。
- **季報**：取最近兩個已公告的季底財報；金額單位為「元」，介面自動換算為億/萬。
- **法說會**：MOPS 為政府網站，偶有連線限制或改版；若查不到會提供 MOPS 連結供手動查詢。
- **股東會**：自 MOPS 股東會專區（`ajax_t108sb31`）結構化抓取當年度（無則前一年）4-8 月之股東常會/臨時會，含日期、召開方式、地點、是否改選董監、電子投票期間與網址；少數落在此區間外的臨時會可能未涵蓋，另附 MOPS 連結供查證。
- FinMind 免費額度有較嚴格的每小時呼叫上限，必要時請申請 token。

## 免責聲明

本站資料來源為 FinMind 與公開資訊觀測站（MOPS），僅供研究參考，不構成任何投資建議。
