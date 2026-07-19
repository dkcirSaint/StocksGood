import { NextRequest, NextResponse } from "next/server";
import { searchConferenceNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";

  if (!name && !id) {
    return NextResponse.json(
      { error: "請提供公司名稱或代號" },
      { status: 400 }
    );
  }

  try {
    const articles = await searchConferenceNews(name, id, date || undefined);
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json(
      { error: "新聞搜尋失敗，請稍後再試" },
      { status: 502 }
    );
  }
}
