import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin, verifyIdToken } from "@/lib/firebase/admin";
import type { YoutubeSearchResultItem } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/search?q=...
 * Cần Bearer Firebase ID (đã đăng nhập; không cần gia đình).
 * Cấu hình YOUTUBE_API_KEY (YouTube Data API v3) trên server.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    if (!token) {
      return NextResponse.json(
        { error: "Thiếu token đăng nhập." },
        { status: 401 },
      );
    }

    await verifyIdToken(token);
    getFirebaseAdmin();

    const apiKey = process.env.YOUTUBE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Chưa cấu hình YOUTUBE_API_KEY trên server (YouTube Data API v3).",
        },
        { status: 503 },
      );
    }

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json(
        { error: "Nhập ít nhất 2 ký tự để tìm." },
        { status: 400 },
      );
    }
    if (q.length > 200) {
      return NextResponse.json(
        { error: "Từ khóa quá dài." },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "12",
      q,
      key: apiKey,
    });

    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
      { next: { revalidate: 0 } },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[youtube/search]", res.status, text.slice(0, 300));
      return NextResponse.json(
        { error: "YouTube không trả kết quả. Thử lại sau." },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: {
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };

    const items: YoutubeSearchResultItem[] = [];
    for (const row of data.items ?? []) {
      const videoId = row.id?.videoId;
      if (!videoId) continue;
      const sn = row.snippet;
      const title =
        typeof sn?.title === "string" && sn.title.trim()
          ? sn.title.trim()
          : "Video";
      const channelTitle =
        typeof sn?.channelTitle === "string" && sn.channelTitle.trim()
          ? sn.channelTitle.trim()
          : "";
      const thumbnailUrl =
        sn?.thumbnails?.medium?.url ||
        sn?.thumbnails?.default?.url ||
        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      items.push({ videoId, title, channelTitle, thumbnailUrl });
    }

    return NextResponse.json({ items });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Không tìm được. Thử lại." },
      { status: 500 },
    );
  }
}
