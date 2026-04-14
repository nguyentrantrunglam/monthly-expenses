/** Trích video ID từ URL YouTube (watch, youtu.be, shorts, embed). */
export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withScheme);
    if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id && isYoutubeId(id) ? id : null;
    }
    if (
      !u.hostname.includes("youtube.com") &&
      !u.hostname.includes("youtube-nocookie.com")
    ) {
      return null;
    }
    const v = u.searchParams.get("v");
    if (v && isYoutubeId(v)) return v;
    const shorts = u.pathname.match(/\/shorts\/([\w-]{11})/);
    if (shorts?.[1] && isYoutubeId(shorts[1])) return shorts[1];
    const embed = u.pathname.match(/\/embed\/([\w-]{11})/);
    if (embed?.[1] && isYoutubeId(embed[1])) return embed[1];
  } catch {
    return null;
  }
  return null;
}

function isYoutubeId(id: string): boolean {
  return /^[\w-]{11}$/.test(id);
}

export function canonicalYoutubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Kết quả tìm kiếm (YouTube Data API) — dùng chung API route + UI. */
export type YoutubeSearchResultItem = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
};

/**
 * Vị trí phát “đúng lúc này” khi đang phát: cộng thời gian trôi từ `stateAtMillis` (server).
 * Dùng để mọi thiết bị nghe gần như cùng nhịp.
 */
export function getEffectivePlaybackSec(
  playbackPositionSec: number,
  isPlaying: boolean,
  stateAtMillis: number | null,
): number {
  if (!isPlaying || stateAtMillis == null) return playbackPositionSec;
  const elapsed = (Date.now() - stateAtMillis) / 1000;
  return Math.max(0, playbackPositionSec + elapsed);
}

export async function fetchYoutubeOEmbed(videoId: string): Promise<{
  title: string;
  thumbnailUrl: string;
}> {
  const pageUrl = canonicalYoutubeWatchUrl(videoId);
  const thumbFallback = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(pageUrl)}&format=json`,
    );
    if (!r.ok) {
      return { title: "Video YouTube", thumbnailUrl: thumbFallback };
    }
    const j = (await r.json()) as Record<string, unknown>;
    const title =
      typeof j.title === "string" && j.title.trim()
        ? j.title.trim()
        : "Video YouTube";
    const thumbnailUrl =
      typeof j.thumbnail_url === "string" && j.thumbnail_url
        ? j.thumbnail_url
        : thumbFallback;
    return { title, thumbnailUrl };
  } catch {
    return { title: "Video YouTube", thumbnailUrl: thumbFallback };
  }
}
