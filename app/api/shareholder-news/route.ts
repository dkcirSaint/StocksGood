import { NextRequest, NextResponse } from "next/server";
import { searchShareholderNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  const id = req.nextUrl.searchParams.get("id")?.trim() ?? "";
  const date = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  const type = req.nextUrl.searchParams.get("type")?.trim() ?? "";

  if (!name && !id) {
    return NextResponse.json(
      { error: "請提供公司名稱或代號" },
      { status: 400 }
    );
  }

  try {
    const articles = await searchShareholderNews(
      name,
      id,
      date || undefined,
      type || undefined
    );
    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json(
      { error: "新聞搜尋失敗，請稍後再試" },
      { status: 502 }
    );
  }
}
