import nodemailer from "nodemailer";
import { isMailEnvConfigured } from "./config";

export function getNotifyRecipient(): string {
  return (
    process.env.NOTIFY_TO?.trim() ||
    process.env.GMAIL_USER?.trim() ||
    ""
  );
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
}): Promise<{ to: string }> {
  if (process.env.NOTIFY_ENABLED === "false") {
    throw new Error("NOTIFY_ENABLED=false，已略過寄信");
  }
  if (!isMailEnvConfigured()) {
    throw new Error("尚未設定 Gmail 寄信環境變數");
  }
  const to = getNotifyRecipient();
  if (!to) throw new Error("找不到收件信箱（NOTIFY_TO / GMAIL_USER）");

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
