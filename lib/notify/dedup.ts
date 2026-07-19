import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SENT_PATH = path.join(DATA_DIR, "notify-sent.json");

/** 保留約 90 天的去重紀錄，避免檔案無限成長 */
const MAX_AGE_DAYS = 90;

interface SentLog {
  keys: Record<string, string>; // key -> ISO timestamp
}

async function readSentLog(): Promise<SentLog> {
  try {
    const raw = await fs.readFile(SENT_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SentLog>;
    return {
      keys:
        parsed.keys && typeof parsed.keys === "object" ? parsed.keys : {},
    };
  } catch {
    return { keys: {} };
  }
}

async function writeSentLog(log: SentLog): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SENT_PATH, JSON.stringify(log, null, 2), "utf8");
}

function pruneOldKeys(log: SentLog): SentLog {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const keys: Record<string, string> = {};
  for (const [k, iso] of Object.entries(log.keys)) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t >= cutoff) keys[k] = iso;
  }
  return { keys };
}

/** 過濾尚未寄過的 keys；回傳應寄送的 keys */
export async function filterUnsentKeys(keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const log = pruneOldKeys(await readSentLog());
  return keys.filter((k) => !log.keys[k]);
}

/** 標記 keys 為已寄送 */
export async function markKeysSent(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const log = pruneOldKeys(await readSentLog());
  const now = new Date().toISOString();
  for (const k of keys) log.keys[k] = now;
  await writeSentLog(log);
}
