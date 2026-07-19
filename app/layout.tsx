import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "荷包股股・StocksGood",
  description:
    "查詢台股月營收增長、近兩季季報，以及法說會/股東會時間與簡報內容",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
