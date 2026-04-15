"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { getEffectivePlaybackSec } from "@/lib/youtube";

let iframeApiLoadPromise: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (iframeApiLoadPromise) return iframeApiLoadPromise;
  iframeApiLoadPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName("script")[0];
    if (!firstScriptTag?.parentNode) {
      resolve();
      return;
    }
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  });
  return iframeApiLoadPromise;
}

type Props = {
  videoId: string;
  /** id phần tử hàng chờ — đổi khi chọn bài khác kể cả cùng videoId YouTube */
  activeQueueItemId: string;
  isPlaying: boolean;
  playbackPositionSec: number;
  stateAtMillis: number | null;
  onPlaybackChange: (isPlaying: boolean, positionSec: number) => void;
  /** Hết bài (ENDED) — chuyển bài trong hàng chờ */
  onVideoEnded?: () => void;
  /** Tắt tiếng loa (chuông thông báo có người vào phòng) */
  outputMuted?: boolean;
  /** Tăng sau chuông để seek lại theo trạng thái Firestore */
  resyncTick?: number;
  /** Tăng sau khi goNext() (lặp một bài / đồng bộ vị trí đầu) */
  boundaryTick?: number;
};

/**
 * Trình phát đồng bộ: mọi client áp dụng cùng trạng thái Firestore + bù trễ theo thời gian.
 */
export function FamilyMusicPlayer({
  videoId,
  activeQueueItemId,
  isPlaying,
  playbackPositionSec,
  stateAtMillis,
  onPlaybackChange,
  onVideoEnded,
  outputMuted = false,
  resyncTick = 0,
  boundaryTick = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastVideoIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPlaybackChangeRef = useRef(onPlaybackChange);
  const onVideoEndedRef = useRef(onVideoEnded);
  const propsRef = useRef({
    videoId,
    isPlaying,
    playbackPositionSec,
    stateAtMillis,
  });

  useLayoutEffect(() => {
    onPlaybackChangeRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  useLayoutEffect(() => {
    onVideoEndedRef.current = onVideoEnded;
  }, [onVideoEnded]);

  useLayoutEffect(() => {
    propsRef.current = {
      videoId,
      isPlaying,
      playbackPositionSec,
      stateAtMillis,
    };
  }, [videoId, isPlaying, playbackPositionSec, stateAtMillis]);

  const [playerReady, setPlayerReady] = useState(false);

  const schedulePublish = useCallback((playing: boolean, pos: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onPlaybackChangeRef.current?.(playing, pos);
    }, 400);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: YtPlayer | null = null;

    void loadYoutubeIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      const YT = window.YT;
      const p = propsRef.current;
      if (!p.videoId) return;

      created = new YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        videoId: p.videoId,
        playerVars: {
          rel: 0,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (e) => {
            if (cancelled) return;
            playerRef.current = e.target;
            /** Để effect sync chạy loadVideoById + seek một lần (tránh trùng seek với onReady). */
            lastVideoIdRef.current = null;
            setPlayerReady(true);
          },
          onStateChange: (e) => {
            if (cancelled || applyingRemoteRef.current) return;
            const st = e.data;
            const PS = YT.PlayerState;
            if (st === PS.ENDED) {
              onVideoEndedRef.current?.();
              return;
            }
            if (st === PS.PLAYING) {
              schedulePublish(true, e.target.getCurrentTime());
            } else if (st === PS.PAUSED) {
              schedulePublish(false, e.target.getCurrentTime());
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      created?.destroy();
      playerRef.current = null;
      setPlayerReady(false);
    };
  }, [schedulePublish]);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || !videoId) return;

    const p = propsRef.current;
    const effective = getEffectivePlaybackSec(
      p.playbackPositionSec,
      p.isPlaying,
      p.stateAtMillis,
    );
    applyingRemoteRef.current = true;
    if (lastVideoIdRef.current !== videoId) {
      lastVideoIdRef.current = videoId;
      /** loadVideoById luôn kích hoạt phát; khi Firestore isPlaying=false dùng cueVideoById (tạm dừng / chỉ nạp video). */
      if (p.isPlaying) {
        player.loadVideoById(videoId, effective);
      } else {
        player.cueVideoById(videoId, effective);
      }
    } else {
      player.seekTo(effective, true);
      if (p.isPlaying) player.playVideo();
      else player.pauseVideo();
    }
    const t = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 600);
    return () => clearTimeout(t);
    /* Chỉ [playerReady, videoId, isPlaying, activeQueueItemId]: không seek theo mỗi lần đổi position (tránh giật). */
  }, [playerReady, videoId, isPlaying, activeQueueItemId]);

  const DRIFT_CHECK_MS = 4000;
  const DRIFT_SEEK_SEC = 3.5;

  useEffect(() => {
    if (!playerReady || !isPlaying) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player || applyingRemoteRef.current) return;
      const pr = propsRef.current;
      const target = getEffectivePlaybackSec(
        pr.playbackPositionSec,
        pr.isPlaying,
        pr.stateAtMillis,
      );
      const cur = player.getCurrentTime();
      if (Math.abs(target - cur) > DRIFT_SEEK_SEC) {
        applyingRemoteRef.current = true;
        player.seekTo(target, true);
        setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 400);
      }
    }, DRIFT_CHECK_MS);
    return () => clearInterval(id);
  }, [playerReady, isPlaying]);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;
    try {
      player.setVolume(outputMuted ? 0 : 100);
    } catch {
      /* ignore */
    }
  }, [playerReady, outputMuted]);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || !videoId) return;
    if (resyncTick === 0) return;
    const p = propsRef.current;
    const effective = getEffectivePlaybackSec(
      p.playbackPositionSec,
      p.isPlaying,
      p.stateAtMillis,
    );
    applyingRemoteRef.current = true;
    player.seekTo(effective, true);
    if (p.isPlaying) player.playVideo();
    else player.pauseVideo();
    const t = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [playerReady, videoId, resyncTick]);

  useEffect(() => {
    if (!playerReady) return;
    const player = playerRef.current;
    if (!player || !videoId) return;
    if (boundaryTick === 0) return;
    const p = propsRef.current;
    const effective = getEffectivePlaybackSec(
      p.playbackPositionSec,
      p.isPlaying,
      p.stateAtMillis,
    );
    applyingRemoteRef.current = true;
    player.seekTo(effective, true);
    if (p.isPlaying) player.playVideo();
    else player.pauseVideo();
    const t = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [playerReady, videoId, boundaryTick]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full bg-black"
      aria-label="Trình phát YouTube đồng bộ"
    />
  );
}
