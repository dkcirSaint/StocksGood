export interface StockInfo {
  stock_id: string;
  stock_name: string;
  industry_category: string;
  /** FinMind market type: twse / tpex / ... */
  type: string;
}

export interface MonthlyRevenuePoint {
  /** 營收所屬年月，例如 "2025-03" */
  yearMonth: string;
  revenueYear: number;
  revenueMonth: number;
  /** 當月營收（元） */
  revenue: number;
  /** 月增率 (相較上個月)，無資料為 null */
  momGrowth: number | null;
  /** 年增率 (相較去年同月)，無資料為 null */
  yoyGrowth: number | null;
}

export interface FinancialMetric {
  key: string;
  label: string;
  value: number | null;
}

export interface QuarterlyReport {
  /** 季別標籤，例如 "2025 Q1" */
  quarter: string;
  /** 財報所屬日期 (季底)，例如 "2025-03-31" */
  date: string;
  metrics: FinancialMetric[];
}

export interface InvestorConference {
  date: string; // 西元日期 yyyy-MM-dd
  rocDate: string; // 民國日期 114/01/16
  time: string;
  location: string;
  summary: string;
  /** 中文簡報 PDF 連結 */
  presentationUrlZh: string | null;
  /** 英文簡報 PDF 連結 */
  presentationUrlEn: string | null;
  videoLink: string | null;
  videoInfo: string | null;
  /** 相對於今天是否已舉行 */
  held: boolean;
}

export interface ShareholderMeeting {
  /** 會議種類：常會 / 臨時會 */
  type: string;
  date: string; // 西元日期 yyyy-MM-dd
  rocDate: string; // 民國日期 115/06/04
  /** 召開方式，例如「實體方式召開」 */
  method: string;
  location: string;
  /** 是否改選董監 */
  boardReelection: string;
  /** 電子投票行使期間 */
  evotingPeriod: string | null;
  /** 電子投票平台 */
  evotingPlatform: string | null;
  /** 電子投票網址 */
  evotingUrl: string | null;
  /** 公告日期（民國） */
  announceDate: string | null;
  /** 相對於今天是否已召開 */
  held: boolean;
}

export interface DailyPrice {
  date: string; // yyyy-MM-dd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 新聞報導 */
export interface NewsArticle {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
}

/** 右側「相關報導」區塊顯示的資料 */
export interface MeetingContent {
  kind: "shareholder" | "conference";
  id: string;
  title: string;
  body: string;
  display: "text" | "news";
  articles?: NewsArticle[];
  links: { label: string; href: string }[];
}

export interface StockResult {
  stock: StockInfo;
  dailyPrices: DailyPrice[];
  monthlyRevenue: MonthlyRevenuePoint[];
  quarterlyReports: QuarterlyReport[];
  conferences: InvestorConference[];
  shareholderMeetings: ShareholderMeeting[];
  mopsConferenceUrl: string;
  mopsShareholderUrl: string;
  warnings: string[];
  /** 證交所殖利率（最近一年度現金股利／收盤價）；無資料為 null */
  dividendYield?: { date: string; yieldPct: number } | null;
  financialsMeta?: {
    latestRevenueMonth: string | null;
    latestQuarterDate: string | null;
    latestPriceDate: string | null;
    revenueFromCache: boolean;
    quarterFromCache: boolean;
    priceFromCache: boolean;
  };
}

/** API 回傳（月營收/季報/K 線可能省略，由客戶端本地快取補上） */
export interface StockApiResponse
  extends Omit<StockResult, "monthlyRevenue" | "quarterlyReports" | "dailyPrices"> {
  monthlyRevenue?: MonthlyRevenuePoint[];
  quarterlyReports?: QuarterlyReport[];
  dailyPrices?: DailyPrice[];
}

export type StockEventKind =
  | "ex_dividend"
  | "ex_rights"
  | "cash_payment"
  | "cash_increase"
  | "capital_reduction"
  | "delisting"
  | "stock_split"
  | "par_value_change"
  | "shareholder_meeting"
  | "investor_conference";

/** 追蹤列表／個股重要行事曆事件 */
export interface StockCalendarEvent {
  id: string;
  stockId: string;
  stockName: string;
  /** yyyy-MM-dd */
  date: string;
  kind: StockEventKind;
  label: string;
  detail?: string;
}

export type LargeHolderTier = "1000" | "400";

/** 大戶籌碼：當週持股快照 */
export interface LargeHolderSnapshot {
  id: string;
  date: string;
  stockId: string;
  stockName: string;
  tier: LargeHolderTier;
  /** 大戶持股比例（%） */
  ratio: number;
  /** 該級距股東人數；舊快取沒有時為 null */
  people: number | null;
  /** 與上一期公布日相比的增減（百分點） */
  wowChange: number | null;
  /** 與上一期公布日相比的人數增減 */
  wowPeople: number | null;
}

/** 大盤融資維持率 */
export interface MarginMaintenanceSnapshot {
  date: string;
  rate: number;
  source: "finmind" | "twse_estimate";
}

/** 個股融資使用率（餘額／限額） */
export interface StockMarginUsageSnapshot {
  stockId: string;
  date: string;
  rate: number;
  balance: number;
  limit: number;
  source: "finmind" | "twse";
}

/** 融資使用率單日點位（供走勢圖使用） */
export interface MarginUsagePoint {
  /** YYYY-MM-DD */
  date: string;
  /** 融資使用率（%） */
  rate: number;
}

/** 加權指數快照 */
export interface MarketIndexSnapshot {
  name: string;
  date: string;
  close: number;
  change: number | null;
  changePct: number | null;
  source: "finmind" | "twse";
}
