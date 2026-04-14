/** Tối thiểu cho YouTube IFrame API (trình phát đồng bộ). */
export {};

declare global {
  interface YtPlayer {
    loadVideoById: (videoId: string, startSeconds?: number) => void;
    /** Nạp video, không tự phát (dùng khi isPlaying === false). */
    cueVideoById: (videoId: string, startSeconds?: number) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
    getCurrentTime: () => number;
    getPlayerState: () => number;
    setVolume: (volume: number) => void;
    destroy: () => void;
  }

  interface Window {
    YT?: {
      Player: new (
        el: string | HTMLElement,
        options: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YtPlayer }) => void;
            onStateChange?: (e: { data: number; target: YtPlayer }) => void;
          };
        },
      ) => YtPlayer;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
