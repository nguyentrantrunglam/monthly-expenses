import { Timestamp } from "firebase/firestore";
import { canonicalYoutubeWatchUrl } from "@/lib/youtube";

export interface MusicQueueItem {
  id: string;
  videoId: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  addedBy: string;
  addedByName: string;
  addedAt: unknown;
}

export interface MusicRoomState {
  queue: MusicQueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  playbackPositionSec: number;
  stateAtMillis: number | null;
  updatedAt: unknown;
}

function parseItem(raw: unknown): MusicQueueItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const videoId = typeof o.videoId === "string" ? o.videoId : "";
  if (!id || !videoId) return null;
  return {
    id,
    videoId,
    title: typeof o.title === "string" ? o.title : "Video",
    thumbnailUrl:
      typeof o.thumbnailUrl === "string" ? o.thumbnailUrl : "",
    url:
      typeof o.url === "string"
        ? o.url
        : canonicalYoutubeWatchUrl(videoId),
    addedBy: typeof o.addedBy === "string" ? o.addedBy : "",
    addedByName:
      typeof o.addedByName === "string" ? o.addedByName : "",
    addedAt: o.addedAt,
  };
}

function parseStateAtMillis(v: unknown): number | null {
  if (v instanceof Timestamp) return v.toMillis();
  return null;
}

export function parseMusicRoomState(
  data: Record<string, unknown> | undefined,
): MusicRoomState {
  const rawQueue = data?.queue;
  const queue: MusicQueueItem[] = [];
  if (Array.isArray(rawQueue)) {
    for (const x of rawQueue) {
      const item = parseItem(x);
      if (item) queue.push(item);
    }
  }
  const ci = data?.currentIndex;
  const currentIndex =
    typeof ci === "number" && Number.isFinite(ci) && ci >= 0
      ? Math.floor(ci)
      : 0;
  const isPlaying =
    typeof data?.isPlaying === "boolean" ? data.isPlaying : true;
  const ps = data?.playbackPositionSec;
  const playbackPositionSec =
    typeof ps === "number" && Number.isFinite(ps) && ps >= 0
      ? ps
      : 0;
  return {
    queue,
    currentIndex,
    isPlaying,
    playbackPositionSec,
    stateAtMillis: parseStateAtMillis(data?.stateAt),
    updatedAt: data?.updatedAt,
  };
}
