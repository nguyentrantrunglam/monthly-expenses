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
  isPlaying: boolean;
  playbackPositionSec: number;
  stateAtMillis: number | null;
  onPlaybackChange: (isPlaying: boolean, positionSec: number) => void;
};

/**
 * Trình phát đồng bộ: mọi client áp dụng cùng trạng thái Firestore + bù trễ theo thời gian.
 */
export function FamilyMusicPlayer({
  videoId,
  isPlaying,
  playbackPositionSec,
  stateAtMillis,
  onPlaybackChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const applyingRemoteRef = useRef(false);
  const lastVideoIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPlaybackChangeRef = useRef(onPlaybackChange);
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
            lastVideoIdRef.current = p.videoId;
            applyingRemoteRef.current = true;
            const eff = getEffectivePlaybackSec(
              p.playbackPositionSec,
              p.isPlaying,
              p.stateAtMillis,
            );
            e.target.seekTo(eff, true);
            if (p.isPlaying) e.target.playVideo();
            else e.target.pauseVideo();
            setTimeout(() => {
              applyingRemoteRef.current = false;
            }, 500);
            setPlayerReady(true);
          },
          onStateChange: (e) => {
            if (cancelled || applyingRemoteRef.current) return;
            const st = e.data;
            const PS = YT.PlayerState;
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

    const effective = getEffectivePlaybackSec(
      playbackPositionSec,
      isPlaying,
      stateAtMillis,
    );
    applyingRemoteRef.current = true;
    if (lastVideoIdRef.current !== videoId) {
      lastVideoIdRef.current = videoId;
      player.loadVideoById(videoId, effective);
    } else {
      player.seekTo(effective, true);
      if (isPlaying) player.playVideo();
      else player.pauseVideo();
    }
    const t = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, 600);
    return () => clearTimeout(t);
  }, [
    playerReady,
    videoId,
    stateAtMillis,
    isPlaying,
    playbackPositionSec,
  ]);

  useEffect(() => {
    if (!playerReady || !isPlaying) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (!player || applyingRemoteRef.current) return;
      const target = getEffectivePlaybackSec(
        playbackPositionSec,
        isPlaying,
        stateAtMillis,
      );
      const cur = player.getCurrentTime();
      if (Math.abs(target - cur) > 2) {
        applyingRemoteRef.current = true;
        player.seekTo(target, true);
        setTimeout(() => {
          applyingRemoteRef.current = false;
        }, 300);
      }
    }, 2500);
    return () => clearInterval(id);
  }, [playerReady, isPlaying, playbackPositionSec, stateAtMillis]);

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full bg-black"
      aria-label="Trình phát YouTube đồng bộ"
    />
  );
}
