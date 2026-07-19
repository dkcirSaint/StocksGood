import type {
  InvestorConference,
  MeetingContent,
  ShareholderMeeting,
} from "./types";

export function conferenceNewsPlaceholder(
  c: InvestorConference
): MeetingContent {
  return {
    kind: "conference",
    id: `conf-news-${c.date}`,
    title: `法人說明會相關報導 · ${c.date}`,
    body: c.summary ? `法人說明會擇要訊息：\n${c.summary}` : "",
    display: "news",
    articles: [],
    links: [],
  };
}

export function shareholderNewsPlaceholder(
  m: ShareholderMeeting
): MeetingContent {
  const lines = [
    `會議種類：${m.type}`,
    `日期：${m.date}（${m.rocDate}）`,
    `狀態：${m.held ? "已召開" : "即將召開"}`,
  ];
  if (m.location) lines.push(`地點：${m.location}`);
  if (m.evotingPeriod) lines.push(`電子投票期間：${m.evotingPeriod}`);

  const links: MeetingContent["links"] = [];
  if (m.evotingUrl) {
    links.push({
      label: `電子投票${m.evotingPlatform ? `（${m.evotingPlatform}）` : ""}`,
      href: m.evotingUrl,
    });
  }

  return {
    kind: "shareholder",
    id: `sh-news-${m.date}-${m.type}`,
    title: `股東會相關報導 · ${m.type} ${m.date}`,
    body: lines.join("\n"),
    display: "news",
    articles: [],
    links,
  };
}
