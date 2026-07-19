import { promises as fs } from "fs";
import path from "path";

export interface NotifyStockItem {
  stockId: string;
  stockName: string;
  keyPrices: number[];
}

/** MACD 三層可分別開關；勾選的層任一觸發即通知 */
export interface NotifyEventToggles {
  touch: boolean;
  /** 第一層：戰術（短波段轉弱／轉強、剛金叉／剛死叉） */
  macdTactical: boolean;
  /** 第二層：結構（頂背離／底背離） */
  macdStructure: boolean;
  /** 第三層：進出場（有效待確認／已確認可進場／已失效） */
  macdEntry: boolean;
  calendar: boolean;
}

export interface NotifyConfig {
  syncedAt: string | null;
  items: NotifyStockItem[];
  events: NotifyEventToggles;
  /** 每天定時掃描時刻（HH:mm，台灣時區），最多 3 組 */
  scheduleTimes: string[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(DATA_DIR, "notify-config.json");
const CRON_LAST_PATH = path.join(DATA_DIR, "notify-cron-last.json");

export const MAX_SCHEDULE_TIMES = 3;

const DEFAULT_EVENTS: NotifyEventToggles = {
  touch: true,
  macdTactical: true,
  macdStructure: true,
  macdEntry: true,
  calendar: true,
};

const DEFAULT_SCHEDULE_TIMES = ["22:03"];

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

/** 正規化 HH:mm；無效則回 null */
export function normalizeTimeHm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!TIME_RE.test(s)) return null;
  const [h, m] = s.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

export function normalizeScheduleTimes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SCHEDULE_TIMES];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const t = normalizeTimeHm(item);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_SCHEDULE_TIMES) break;
  }
  return out;
}

function normalizeEvents(raw: unknown): NotifyEventToggles {
  const obj =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};

  const hasNewMacd =
    "macdTactical" in obj ||
    "macdStructure" in obj ||
    "macdEntry" in obj;

  if (!hasNewMacd && "macdConfirmed" in obj) {
    return {
      touch: asBool(obj.touch, true),
      macdTactical: false,
      macdStructure: false,
      macdEntry: asBool(obj.macdConfirmed, true),
      calendar: asBool(obj.calendar, true),
    };
  }

  return {
    touch: asBool(obj.touch, DEFAULT_EVENTS.touch),
    macdTactical: asBool(obj.macdTactical, DEFAULT_EVENTS.macdTactical),
    macdStructure: asBool(obj.macdStructure, DEFAULT_EVENTS.macdStructure),
    macdEntry: asBool(obj.macdEntry, DEFAULT_EVENTS.macdEntry),
    calendar: asBool(obj.calendar, DEFAULT_EVENTS.calendar),
  };
}

function normalizeConfig(raw: unknown): NotifyConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifyConfig> & {
    scheduleTimes?: unknown;
  };
  const items: NotifyStockItem[] = [];
  if (Array.isArray(obj.items)) {
    for (const it of obj.items) {
      if (!it || typeof it !== "object") continue;
      const stockId = String((it as NotifyStockItem).stockId ?? "").trim();
      if (!stockId) continue;
      const stockName =
        String((it as NotifyStockItem).stockName ?? "").trim() || stockId;
      const keyPrices = Array.isArray((it as NotifyStockItem).keyPrices)
        ? (it as NotifyStockItem).keyPrices
            .filter((n) => typeof n === "number" && Number.isFinite(n) && n > 0)
            .slice(0, 4)
        : [];
      items.push({ stockId, stockName, keyPrices });
    }
  }
  return {
    syncedAt: typeof obj.syncedAt === "string" ? obj.syncedAt : null,
    items,
    events: normalizeEvents(obj.events),
    scheduleTimes:
      obj.scheduleTimes !== undefined
        ? normalizeScheduleTimes(obj.scheduleTimes)
        : [...DEFAULT_SCHEDULE_TIMES],
  };
}

export async function readNotifyConfig(): Promise<NotifyConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch {
    return {
      syncedAt: null,
      items: [],
      events: { ...DEFAULT_EVENTS },
      scheduleTimes: [...DEFAULT_SCHEDULE_TIMES],
    };
  }
}

export async function writeNotifyConfig(
  partial: Partial<NotifyConfig> & { items?: NotifyStockItem[] }
): Promise<NotifyConfig> {
  const current = await readNotifyConfig();
  const next: NotifyConfig = {
    syncedAt:
      partial.syncedAt !== undefined ? partial.syncedAt : current.syncedAt,
    items: partial.items !== undefined ? partial.items : current.items,
    events: partial.events
      ? normalizeEvents(partial.events)
      : current.events,
    scheduleTimes:
      partial.scheduleTimes !== undefined
        ? normalizeScheduleTimes(partial.scheduleTimes)
        : current.scheduleTimes,
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function getNotifyStatusSummary(config: NotifyConfig) {
  return {
    stockCount: config.items.length,
    syncedAt: config.syncedAt,
    events: config.events,
    scheduleTimes: config.scheduleTimes,
    mailConfigured: isMailEnvConfigured(),
    notifyEnabled: process.env.NOTIFY_ENABLED !== "false",
  };
}

export function isMailEnvConfigured(): boolean {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim();
  return Boolean(user && pass);
}

/** 台灣時區目前 HH:mm */
export function taiwanNowHm(): string {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export async function readCronLastStamp(): Promise<string | null> {
  try {
    const raw = await fs.readFile(CRON_LAST_PATH, "utf8");
    const parsed = JSON.parse(raw) as { stamp?: string };
    return typeof parsed.stamp === "string" ? parsed.stamp : null;
  } catch {
    return null;
  }
}

export async function writeCronLastStamp(stamp: string): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    CRON_LAST_PATH,
    JSON.stringify({ stamp }, null, 2),
    "utf8"
  );
}
