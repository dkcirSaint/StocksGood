import nodemailer from "nodemailer";
import { isMailEnvConfigured, readNotifyConfig } from "./config";

/** 僅讀環境變數的收件者（NOTIFY_TO → GMAIL_USER） */
export function getNotifyRecipientFromEnv(): string {
  return (
    process.env.NOTIFY_TO?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    ""
  );
}

/**
 * 解析實際收件者：選單設定 notifyTo → NOTIFY_TO → GMAIL_USER
 */
export async function resolveNotifyRecipient(
  override?: string | null
): Promise<string> {
  const fromArg = override?.trim();
  if (fromArg) return fromArg;
  try {
    const config = await readNotifyConfig();
    const fromConfig = config.notifyTo?.trim();
    if (fromConfig) return fromConfig;
  } catch {
    /* ignore */
  }
  return getNotifyRecipientFromEnv();
}

/** @deprecated 請改用 resolveNotifyRecipient；保留同步版供簡易查詢 */
export function getNotifyRecipient(): string {
  return getNotifyRecipientFromEnv();
}

export function createGmailTransport() {
  const user = process.env.GMAIL_USER?.trim();
  const pass = process.env.GMAIL_APP_PASSWORD?.trim()?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD");
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export async function sendNotifyEmail(opts: {
  subject: string;
  text: string;
  to?: string | null;
}): Promise<{ to: string }> {
  if (process.env.NOTIFY_ENABLED === "false") {
    throw new Error("NOTIFY_ENABLED=false，已略過寄信");
  }
  if (!isMailEnvConfigured()) {
    throw new Error("尚未設定 Gmail 寄信環境變數");
  }
  const to = await resolveNotifyRecipient(opts.to);
  if (!to) {
    throw new Error(
      "找不到收件信箱（請在通知選單設定，或填 NOTIFY_TO / GMAIL_USER）"
    );
  }

  const from = process.env.GMAIL_USER!.trim();
  const transport = createGmailTransport();
  await transport.sendMail({
    from: `"荷包股股 StocksGood" <${from}>`,
    to,
    subject: opts.subject,
    text: opts.text,
  });
  return { to };
}
