import { NextRequest, NextResponse } from "next/server";

const UPSTREAM =
  "https://baotinmanhhai.vn/api/v1/exchangerate/goldRateChart";

export async function GET(req: NextRequest) {
  const goldType = req.nextUrl.searchParams.get("gold_type") || "KGB";
  const timeType = req.nextUrl.searchParams.get("time_type") || "day";
  const init = req.nextUrl.searchParams.get("init") || "false";

  const url = `${UPSTREAM}?gold_type=${encodeURIComponent(goldType)}&time_type=${encodeURIComponent(timeType)}&init=${encodeURIComponent(init)}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "upstream", status: res.status },
        { status: 502 },
      );
    }
    const data = (await res.json()) as unknown;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
}
