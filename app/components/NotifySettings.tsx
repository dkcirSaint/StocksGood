"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "./Modal";
import type { Watchlist } from "@/lib/watchlists";
import {
  getEstPriceTargets,
  type EstPriceTarget,
} from "@/lib/estimated-price";

interface NotifyEventToggles {
  touch: boolean;
  macdTactical: boolean;
  macdStructure: boolean;
  macdEntry: boolean;
  calendar: boolean;
}

interface NotifyStatus {
  stockCount: number;
  syncedAt: string | null;
  events: NotifyEventToggles;
  scheduleTimes?: string[];
  notifyTo?: string | null;
  mailConfigured: boolean;
  notifyEnabled: boolean;
  serverAlive?: boolean;
  nowHm?: string;
  lastCronStamp?: string | null;
  nextTimes?: string[];
  autostart?: string;
}

const DEFAULT_EVENTS: NotifyEventToggles = {
  touch: true,
  macdTactical: true,
  macdStructure: true,
  macdEntry: true,
  calendar: true,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function padScheduleSlots(times: string[] | undefined): [string, string, string] {
  const t = [...(times ?? [])];
  while (t.length < 3) t.push("");
  return [t[0] ?? "", t[1] ?? "", t[2] ?? ""];
}

function collectValidTimes(slots: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of slots) {
    const s = raw.trim();
    if (!s) continue;
    if (!TIME_RE.test(s)) continue;
    const [h, m] = s.split(":");
    const norm = `${h.padStart(2, "0")}:${m}`;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= 3) break;
  }
  return out;
}

export default function NotifySettings({
  open,
  onClose,
  lists,
}: {
  open: boolean;
  onClose: () => void;
  lists: Watchlist[];
}) {
  const [status, setStatus] = useState<NotifyStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<NotifyEventToggles>(DEFAULT_EVENTS);
  const [scheduleSlots, setScheduleSlots] = useState<[string, string, string]>([
    "22:03",
    "",
    "",
  ]);
  const [notifyTo, setNotifyTo] = useState("");

  const applyFormFromServer = useCallback((data: NotifyStatus) => {
    if (data.events) {
      setEvents({
        touch: data.events.touch !== false,
        macdTactical: data.events.macdTactical === true,
        macdStructure: data.events.macdStructure === true,
        macdEntry: data.events.macdEntry === true,
        calendar: data.events.calendar !== false,
      });
    }
    setScheduleSlots(padScheduleSlots(data.scheduleTimes));
    setNotifyTo(
      typeof data.notifyTo === "string" && data.notifyTo.trim()
        ? data.notifyTo.trim()
        : ""
    );
  }, []);

  const refresh = useCallback(
    async (opts?: { syncForm?: boolean }) => {
      try {
        const res = await fetch("/api/notify/health");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "無法讀取通知狀態");
        setStatus(data);
        if (opts?.syncForm) {
          applyFormFromServer(data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (opts?.syncForm) setStatus(null);
      }
    },
    [applyFormFromServer]
  );

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setError(null);
    void refresh({ syncForm: true });
    const id = window.setInterval(() => {
      // 背景只更新狀態列，不碰時間輸入（避免調整時刻時亂跳）
      void refresh({ syncForm: false });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [open, refresh]);

  function updateScheduleSlot(idx: number, value: string) {
    setScheduleSlots((prev) => {
      const next = [...prev] as [string, string, string];
      next[idx] = value;
      return next;
    });
  }

  function updateEvent<K extends keyof NotifyEventToggles>(
    key: K,
    value: NotifyEventToggles[K]
  ) {
    setEvents((prev) => ({ ...prev, [key]: value }));
  }

  function validateScheduleOrThrow(): string[] {
    for (const raw of scheduleSlots) {
      const s = raw.trim();
      if (!s) continue;
      if (!TIME_RE.test(s)) {
        throw new Error(`時間格式須為 HH:mm（24 小時制），「${s}」無效`);
      }
    }
    return collectValidTimes(scheduleSlots);
  }

  async function syncWatchlist() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const scheduleTimes = validateScheduleOrThrow();
      const map = new Map<
        string,
        {
          stockId: string;
          stockName: string;
          estPriceTargets: EstPriceTarget[];
        }
      >();
      for (const list of lists) {
        for (const it of list.items) {
          if (map.has(it.stockId)) continue;
          map.set(it.stockId, {
            stockId: it.stockId,
            stockName: it.stockName,
            estPriceTargets: getEstPriceTargets(it.stockId),
          });
        }
      }
      const items = Array.from(map.values()).slice(0, 30);
      const notifyLists = lists.map((l) => ({
        id: l.id,
        name: l.name,
        stockIds: l.items.map((it) => it.stockId),
      }));
      const res = await fetch("/api/notify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          lists: notifyLists,
          events,
          scheduleTimes,
          notifyTo: notifyTo.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "同步失敗");
      setStatus(data);
      setScheduleSlots(padScheduleSlots(data.scheduleTimes));
      if (typeof data.notifyTo === "string") setNotifyTo(data.notifyTo);
      else if (data.notifyTo == null) setNotifyTo("");
      const timesLabel =
        Array.isArray(data.scheduleTimes) && data.scheduleTimes.length > 0
          ? data.scheduleTimes.join("、")
          : "無";
      setMessage(
        `已同步 ${data.stockCount} 檔；定時 ${timesLabel}（台灣時間）`
      );
      void refresh({ syncForm: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveScheduleOnly() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const scheduleTimes = validateScheduleOrThrow();
      const trimmedTo = notifyTo.trim();
      if (trimmedTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedTo)) {
        throw new Error("收件 Email 格式無效");
      }
      const res = await fetch("/api/notify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events,
          scheduleTimes,
          notifyTo: trimmedTo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "儲存失敗");
      setStatus(data);
      setScheduleSlots(padScheduleSlots(data.scheduleTimes));
      if (typeof data.notifyTo === "string") setNotifyTo(data.notifyTo);
      else if (data.notifyTo == null) setNotifyTo("");
      const timesLabel =
        Array.isArray(data.scheduleTimes) && data.scheduleTimes.length > 0
          ? data.scheduleTimes.join("、")
          : "無（不定時掃描）";
      const toLabel = data.notifyTo || "（沿用 .env）";
      setMessage(`已儲存定時：${timesLabel}；收件 ${toLabel}`);
      try {
        const auto = await fetch("/api/notify/health", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "install" }),
        });
        const autoData = await auto.json();
        if (auto.ok) {
          setMessage(
            `已儲存定時：${timesLabel}；已啟用登入後自動啟動伺服器`
          );
        } else if (autoData.error) {
          setMessage(
            `已儲存定時：${timesLabel}（自動啟動未成功：${autoData.error}）`
          );
        }
      } catch {
        /* 自動啟動失敗不阻擋定時儲存 */
      }
      void refresh({ syncForm: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function setAutostart(action: "install" | "uninstall") {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/notify/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失敗");
      setMessage(
        action === "install"
          ? "已啟用：登入 Mac 後會自動啟動開發伺服器（休眠仍不會掃描）"
          : "已關閉登入自動啟動"
      );
      void refresh({ syncForm: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function testMail() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/notify/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "測試寄信失敗");
      setMessage(`測試信已寄出至 ${data.to}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/notify/scan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "掃描失敗");
      const refreshedHint =
        typeof data.refreshed === "number"
          ? `先更新 ${data.refreshed} 檔，`
          : "";
      if (data.emailed) {
        const resent =
          data.skippedDup > 0 ? `（含先前已通知 ${data.skippedDup} 則）` : "";
        setMessage(
          `${refreshedHint}已寄出 ${data.sent} 則通知（掃描 ${data.scanned} 檔）${resent}`
        );
      } else if (data.scanned === 0) {
        setMessage(
          "尚未同步追蹤清單：請先按「同步目前追蹤清單」，再掃描。"
        );
      } else if (data.found === 0) {
        setMessage(
          `掃描完成：${refreshedHint}目前無符合條件的事件（已掃描 ${data.scanned} 檔）`
        );
      } else {
        setMessage(
          `掃描完成：${refreshedHint}找到 ${data.found} 則事件但未寄出（請檢查 NOTIFY_ENABLED／Gmail 設定）`
        );
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setError(data.errors.slice(0, 3).join("；"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const syncedLabel = status?.syncedAt
    ? new Date(status.syncedAt).toLocaleString("zh-TW", {
        timeZone: "Asia/Taipei",
      })
    : "尚未同步";

  const scheduleLabel =
    status?.scheduleTimes && status.scheduleTimes.length > 0
      ? status.scheduleTimes.join("、")
      : "尚未設定";

  const autostartLabel =
    status?.autostart === "loaded"
      ? "已啟用（登入自動啟動）"
      : status?.autostart === "installed_not_loaded"
        ? "已安裝但未載入"
        : status?.autostart === "not_installed"
          ? "未啟用"
          : "—";

  return (
    <Modal open={open} title="Email 通知" onClose={onClose}>
      <section className="notify-section">
        <p className="notify-lead">
          能打開此頁面＝開發伺服器有在跑。定時掃描需伺服器開著且電腦未休眠；可啟用「登入後自動啟動」減少忘記開
          <code>npm run dev</code> 的情況。
        </p>

        <ul className="notify-status">
          <li>
            開發伺服器：
            {status?.serverAlive ? (
              <span className="notify-ok">運作中</span>
            ) : (
              <span className="notify-warn">無法連線</span>
            )}
            {status?.nowHm ? `（現在 ${status.nowHm}）` : ""}
          </li>
          <li>
            登入自動啟動：
            {status?.autostart === "loaded" ? (
              <span className="notify-ok">{autostartLabel}</span>
            ) : (
              <span className="notify-warn">{autostartLabel}</span>
            )}
          </li>
          <li>
            Gmail 設定：
            {status?.mailConfigured ? (
              <span className="notify-ok">已設定</span>
            ) : (
              <span className="notify-warn">未設定（請填 .env）</span>
            )}
          </li>
          <li>
            寄信開關：
            {status?.notifyEnabled !== false ? (
              <span className="notify-ok">啟用</span>
            ) : (
              <span className="notify-warn">NOTIFY_ENABLED=false</span>
            )}
          </li>
          <li>已同步檔數：{status?.stockCount ?? "—"}</li>
          <li>上次同步：{syncedLabel}</li>
          <li>定時掃描：{scheduleLabel}</li>
          <li>
            今日剩餘時刻：
            {status?.nextTimes && status.nextTimes.length > 0
              ? status.nextTimes.join("、")
              : "—"}
          </li>
          <li>上次到點掃描：{status?.lastCronStamp ?? "尚未執行"}</li>
          <li>
            收件信箱：
            {status?.notifyTo ? (
              <span className="notify-ok">{status.notifyTo}</span>
            ) : (
              <span className="notify-warn">未設定（將用 .env）</span>
            )}
          </li>
        </ul>

        <fieldset className="notify-events">
          <legend>被通知者 Email</legend>
          <label className="notify-to-field">
            <span>收件信箱</span>
            <input
              type="email"
              className="notify-to-input"
              value={notifyTo}
              onChange={(e) => setNotifyTo(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <p className="notify-hint">
            通知信會寄到此信箱。留空則改用環境變數{" "}
            <code>NOTIFY_TO</code>，再沒有則用 <code>GMAIL_USER</code>
            。按「儲存定時」或「同步目前追蹤清單」一併寫入。
          </p>
        </fieldset>

        <fieldset className="notify-events">
          <legend>伺服器自動啟動</legend>
          <p className="notify-hint">
            瀏覽器無法在關機／關閉終端後自己開起 npm；啟用後會在你登入
            Mac 時自動跑開發伺服器。電腦休眠時定時仍不會執行。
          </p>
          <div className="notify-actions">
            <button
              type="button"
              className="feature-item"
              disabled={loading}
              onClick={() => void setAutostart("install")}
            >
              啟用登入自動啟動
            </button>
            <button
              type="button"
              className="feature-item"
              disabled={loading}
              onClick={() => void setAutostart("uninstall")}
            >
              關閉自動啟動
            </button>
          </div>
        </fieldset>

        <fieldset className="notify-events">
          <legend>定時掃描（最多 3 組，HH:mm）</legend>
          <div className="notify-schedule-row">
            {scheduleSlots.map((value, idx) => (
              <label key={idx} className="notify-schedule-slot">
                <span>時間 {idx + 1}</span>
                <input
                  type="time"
                  value={value}
                  onChange={(e) => updateScheduleSlot(idx, e.target.value)}
                />
              </label>
            ))}
          </div>
          <p className="notify-hint">
            留空表示不使用該格。到點時會先強制更新清單股價／行事曆，再掃描通報。按「儲存定時」或「同步目前追蹤清單」寫入伺服器。
          </p>
          <button
            type="button"
            className="feature-item"
            disabled={loading}
            onClick={() => void saveScheduleOnly()}
          >
            儲存定時
          </button>
        </fieldset>

        <fieldset className="notify-events">
          <legend>通知事件</legend>
          <label>
            <input
              type="checkbox"
              checked={events.touch}
              onChange={(e) => updateEvent("touch", e.target.checked)}
            />
            觸價通知（收盤價落在今年／明年上緣・合理・下緣區間）
          </label>
          <label>
            <input
              type="checkbox"
              checked={events.calendar}
              onChange={(e) => updateEvent("calendar", e.target.checked)}
            />
            行事曆（當天～前 3 天）
          </label>
        </fieldset>

        <fieldset className="notify-events">
          <legend>MACD（勾選的層・任一觸發即通知）</legend>
          <label>
            <input
              type="checkbox"
              checked={events.macdTactical}
              onChange={(e) => updateEvent("macdTactical", e.target.checked)}
            />
            戰術：短波段轉弱／轉強、剛金叉／剛死叉
          </label>
          <label>
            <input
              type="checkbox"
              checked={events.macdStructure}
              onChange={(e) => updateEvent("macdStructure", e.target.checked)}
            />
            結構：頂背離／底背離
          </label>
          <label>
            <input
              type="checkbox"
              checked={events.macdEntry}
              onChange={(e) => updateEvent("macdEntry", e.target.checked)}
            />
            進出場：等金叉・可偏多進場・暫緩；等死叉・可減碼／出場・訊號取消
          </label>
          <p className="notify-hint">勾選後請再按「同步目前追蹤清單」寫入伺服器。</p>
        </fieldset>

        <div className="notify-actions">
          <button
            type="button"
            className="feature-item"
            disabled={loading}
            onClick={() => void syncWatchlist()}
          >
            同步目前追蹤清單
          </button>
          <button
            type="button"
            className="feature-item"
            disabled={loading || !status?.mailConfigured}
            onClick={() => void testMail()}
          >
            測試寄信
          </button>
          <button
            type="button"
            className="feature-item"
            disabled={loading || !status?.mailConfigured}
            onClick={() => void runScan()}
          >
            立即掃描一次
          </button>
        </div>

        {message && <p className="notify-message">{message}</p>}
        {error && <p className="notify-error">{error}</p>}

        <p className="notify-hint">
          請在 `.env` 設定 `GMAIL_USER`、`GMAIL_APP_PASSWORD`（Google
          應用程式密碼）。收件者可在上方「被通知者 Email」設定，或選填
          <code>NOTIFY_TO</code>。
        </p>
      </section>
    </Modal>
  );
}
